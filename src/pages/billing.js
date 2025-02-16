import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button, Form, Table, Modal } from "react-bootstrap";
import { db } from "../firebase/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  limit,
  writeBatch,
  doc,
  increment,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./billing.css";
import LoaderC from "../utills/loaderC";

const Billing = () => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("");
  const [loading, setLoading] = useState(false);
  const [userUID, setUserUID] = useState(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [syncStatus, setSyncStatus] = useState('synced'); // 'synced', 'pending', 'error'
  const [pendingOrders, setPendingOrders] = useState([]);

  // Load pending orders from localStorage on component mount
  useEffect(() => {
    const stored = localStorage.getItem('pendingOrders');
    if (stored) {
      setPendingOrders(JSON.parse(stored));
      setSyncStatus('pending');
    }
  }, []);

  // Background sync function
  const syncPendingOrders = async () => {
    if (!navigator.onLine || !userUID) return;

    const stored = localStorage.getItem('pendingOrders');
    if (!stored) return;

    const orders = JSON.parse(stored);
    if (orders.length === 0) return;

    setSyncStatus('pending');

    for (const order of orders) {
      try {
        const batch = writeBatch(db);
        
        // Create order document
        const orderRef = doc(collection(db, "users", userUID, "orders"));
        batch.set(orderRef, {
          ...order,
          syncedAt: serverTimestamp()
        });

        // Update product quantities
        order.items.forEach((item) => {
          const productRef = doc(db, "users", userUID, "products", item.id);
          batch.update(productRef, {
            stockQty: increment(-item.quantity),
          });
        });

        await batch.commit();
        
        // Remove synced order from pending list
        setPendingOrders(prev => prev.filter(o => o.localId !== order.localId));
        localStorage.setItem('pendingOrders', JSON.stringify(
          pendingOrders.filter(o => o.localId !== order.localId)
        ));
        
        notifySuccess(`Order ${order.localId} synced successfully`);
      } catch (error) {
        console.error("Error syncing order:", error);
        setSyncStatus('error');
      }
    }

    if (pendingOrders.length === 0) {
      setSyncStatus('synced');
    }
  };

  // Add online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      syncPendingOrders();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [userUID, pendingOrders]);

  const notifySuccess = (message) => toast.success(message);
  const notifyError = (message) => toast.error(message);

  const fetchProducts = useCallback(async (uid) => {
    if (!uid) return;
    setLoading(true);

    try {
      const productsRef = collection(db, "users", uid, "products");
      const q = query(productsRef, where("archived", "==", false), limit(50));
      const querySnapshot = await getDocs(q);
      let productsList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Batch fetch all images at once
      const imagesRef = collection(db, "users", uid, "productImages");
      const imagesSnapshot = await getDocs(imagesRef);
      const imageMap = {};
      
      // Create a map of productId to image data
      imagesSnapshot.docs.forEach((doc) => {
        const imageData = doc.data();
        if (imageData.productId && imageData.productImage) {
          imageMap[imageData.productId] = imageData.productImage;
        }
      });

      // Update local cache with new image data
      localStorage.setItem("productImages", JSON.stringify(imageMap));

      // Attach images to products
      productsList = productsList.map(product => ({
        ...product,
        productImage: product.productId ? imageMap[product.productId] : null
      }));

      setProducts(productsList);
    } catch (error) {
      console.error("Error fetching products:", error);
      notifyError("Error fetching products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserUID(user.uid);
        fetchProducts(user.uid);
      }
    });
    return () => unsubscribe();
  }, [fetchProducts]);

  const addToCart = useCallback((product) => {
    // Check if product has zero or negative stock
    if (product.stockQty <= 0) {
      notifyError("Product is out of stock");
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        // Check if adding one more would exceed available stock
        if (existingItem.quantity >= product.stockQty) {
          notifyError("Cannot add more than available stock");
          return prevCart;
        }
        return prevCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id === productId) {
            return item.quantity === 1
              ? null
              : { ...item, quantity: item.quantity - 1 };
          }
          return item;
        })
        .filter(Boolean)
    );
  }, []);

  const updateQuantity = useCallback(
    (productId, newQuantity) => {
      if (newQuantity < 1) return;

      const product = products.find((p) => p.id === productId);
      if (newQuantity > product.stockQty) {
        notifyError("Cannot add more than available stock");
        return;
      }

      setCart((prevCart) =>
        prevCart.map((item) =>
          item.id === productId ? { ...item, quantity: newQuantity } : item
        )
      );
    },
    [products]
  );

  const calculateTotal = useCallback(() => {
    return cart.reduce(
      (total, item) => total + item.retailPrice * item.quantity,
      0
    );
  }, [cart]);

  const getQuantityInCart = useCallback(
    (productId) => {
      const item = cart.find((item) => item.id === productId);
      return item ? item.quantity : 0;
    },
    [cart]
  );

  const handleCheckout = async () => {
    if (!customerInfo.name || !customerInfo.phone) {
      notifyError("Please fill in customer name and phone number");
      return;
    }

    setProcessingCheckout(true);
    try {
      // Prepare order data
      const cleanedCartItems = cart.map((item) => {
        const { productImage, ...cleanedItem } = item;
        return cleanedItem;
      });

      const orderData = {
        localId: Date.now().toString(), // Unique local ID
        customerInfo,
        items: cleanedCartItems,
        total: calculateTotal(),
        timestamp: new Date().toISOString(),
        status: "pending",
        createdOffline: !navigator.onLine
      };

      // Store in pending orders
      const updatedPendingOrders = [...pendingOrders, orderData];
      setPendingOrders(updatedPendingOrders);
      localStorage.setItem('pendingOrders', JSON.stringify(updatedPendingOrders));

      // Update local product quantities
      const updatedProducts = products.map(product => {
        const cartItem = cart.find(item => item.id === product.id);
        if (cartItem) {
          return {
            ...product,
            stockQty: product.stockQty - cartItem.quantity
          };
        }
        return product;
      });
      setProducts(updatedProducts);

      // Try to sync if online
      if (navigator.onLine) {
        syncPendingOrders();
      } else {
        setSyncStatus('pending');
        notifySuccess("Order saved offline. Will sync when online.");
      }

      // Clear cart and form
      setCart([]);
      setCustomerInfo({
        name: "",
        phone: "",
        email: "",
        address: "",
      });
      setShowCheckoutModal(false);
    } catch (error) {
      console.error("Error processing checkout:", error);
      notifyError("Error processing checkout");
    } finally {
      setProcessingCheckout(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) =>
        product.productName.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        // First, sort by stock status (in stock products first)
        if ((a.stockQty <= 0) !== (b.stockQty <= 0)) {
          return a.stockQty <= 0 ? 1 : -1;
        }
        
        // Then apply the selected sort option
        switch (sortOption) {
          case "name":
            return a.productName.localeCompare(b.productName);
          case "price":
            return a.retailPrice - b.retailPrice;
          default:
            // If no sort option, still maintain in-stock items at top
            return 0;
        }
      });
  }, [products, searchTerm, sortOption]);

  return (
    <>
      {loading && <LoaderC />}
      <ToastContainer />
      <div className="billing-container">
        <div className="search-sort-section d-flex p-2">
          <Form.Control
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-25"
          />
          <Form.Select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="w-25"
          >
            <option value="">Sort by...</option>
            <option value="name">Name</option>
            <option value="price">Price</option>
          </Form.Select>
        </div>

        <div className="billing-content">
          <div className="product-flex-container m-1">
            {filteredProducts.map((product) => (
              <div
                className={`product-card ${
                  getQuantityInCart(product.id) > 0 ? "has-items" : ""
                } ${product.stockQty <= 0 ? "out-of-stock" : ""}`}
                key={product.id}
                style={{
                  backgroundImage: product.productImage
                    ? `url(${product.productImage})`
                    : "url(https://via.placeholder.com/150)",
                  cursor: product.stockQty <= 0 ? "not-allowed" : "pointer",
                }}
                onClick={() => product.stockQty > 0 && addToCart(product)}
              >
                {getQuantityInCart(product.id) > 0 && (
                  <>
                    <div className="product-quantity-badge">
                      {getQuantityInCart(product.id)}
                    </div>
                    <button
                      className="product-minus-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromCart(product.id);
                      }}
                    >
                      -
                    </button>
                  </>
                )}
                <div className="details">
                  <div className="p-2">
                    <p>
                      Qty: <span>{product.stockQty}</span>
                    </p>
                    <p>
                      <span>{product.productName}</span>
                    </p>
                    <p className="">MRP: ₹{product.mrp}</p>
                    <p>Price: ₹{product.retailPrice}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {cart.length > 0 && (
            <div
              className="floating-cart"
              onClick={() => setShowCartModal(true)}
            >
              <i className="fas fa-shopping-cart"></i>
              <div className="cart-total">₹{calculateTotal()}</div>
              <div className="cart-counter">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cart Modal */}
      <Modal show={showCartModal} onHide={() => setShowCartModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Shopping Cart</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex justify-content-between align-items-center mt-2 mb-3">
            <h4>Total: ₹{calculateTotal()}</h4>
            <div className="cart-actions">
              <Button
                variant="danger"
                onClick={() => {
                  setCart([]);
                  setShowCartModal(false);
                }}
                className="cancel-all-button"
              >
                Cancel All
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowCartModal(false);
                  setShowCheckoutModal(true);
                }}
              >
                Proceed to Checkout
              </Button>
            </div>
          </div>
          <Table striped bordered hover className="m-0">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}</td>
                  <td>
                    <Form.Control
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(item.id, parseInt(e.target.value))
                      }
                    />
                  </td>
                  <td>₹{item.retailPrice * item.quantity}</td>
                  <td>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => removeFromCart(item.id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Modal.Body>
      </Modal>

      {/* Checkout Modal */}
      <Modal
        show={showCheckoutModal}
        onHide={() => setShowCheckoutModal(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Checkout</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Customer Name*</Form.Label>
              <Form.Control
                type="text"
                value={customerInfo.name}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, name: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Phone Number*</Form.Label>
              <Form.Control
                type="tel"
                value={customerInfo.phone}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, phone: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email (Optional)</Form.Label>
              <Form.Control
                type="email"
                value={customerInfo.email}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, email: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Address (Optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={customerInfo.address}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, address: e.target.value })
                }
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowCheckoutModal(false)}
            disabled={processingCheckout}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCheckout}
            disabled={processingCheckout}
          >
            {processingCheckout ? "Processing..." : "Complete Order"}
          </Button>
        </Modal.Footer>
      </Modal>
      <div className="sync-status-indicator">
        {syncStatus === 'pending' && (
          <span className="text-warning">
            ⚠️ {pendingOrders.length} orders pending sync
          </span>
        )}
        {syncStatus === 'error' && (
          <span className="text-danger">
            ❌ Sync error
          </span>
        )}
        {syncStatus === 'synced' && (
          <span className="text-success">
            ✓ All orders synced
          </span>
        )}
      </div>
    </>
  );
};

export default Billing;
