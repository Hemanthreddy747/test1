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
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
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
      const batch = writeBatch(db);

      // Create order document reference
      const orderRef = doc(collection(db, "users", userUID, "orders"));

      // Prepare order data with cleaned cart items (removing productImage)
      const cleanedCartItems = cart.map((item) => {
        const { productImage, ...cleanedItem } = item;
        return cleanedItem;
      });

      const orderData = {
        customerInfo,
        items: cleanedCartItems,
        total: calculateTotal(),
        timestamp: serverTimestamp(),
        status: "completed",
      };

      // Add order to batch
      batch.set(orderRef, orderData);

      // Update product quantities in the same batch
      cart.forEach((item) => {
        const productRef = doc(db, "users", userUID, "products", item.id);
        batch.update(productRef, {
          stockQty: increment(-item.quantity),
        });
      });

      // Commit all changes in a single batch
      await batch.commit();

      notifySuccess("Order completed successfully");
      setCart([]);
      setCustomerInfo({
        name: "",
        phone: "",
        email: "",
        address: "",
      });
      setShowCheckoutModal(false);
      fetchProducts(userUID);
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
        switch (sortOption) {
          case "name":
            return a.productName.localeCompare(b.productName);
          case "price":
            return a.retailPrice - b.retailPrice;
          default:
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
                }`}
                key={product.id}
                style={{
                  backgroundImage: product.productImage
                    ? `url(${product.productImage})`
                    : "url(https://via.placeholder.com/150)",
                }}
                onClick={() => addToCart(product)}
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
    </>
  );
};

export default Billing;
