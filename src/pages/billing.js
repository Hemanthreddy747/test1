import React, { useState, useEffect, useCallback } from "react";
import { Button, Form, Table, Modal } from "react-bootstrap";
import { db } from "../firebase/firebase";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  limit,
  writeBatch, // ensure this is here
  doc, // ensure this is here
  increment, // add this
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
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });

  // Notification helpers
  const notifyError = (message) => toast.error(message);
  const notifySuccess = (message) => toast.success(message);

  // Add new function for image caching
  const cacheProductImages = async (uid) => {
    try {
      const imagesRef = collection(db, "users", uid, "productImages");
      const imagesSnapshot = await getDocs(imagesRef);
      const imageCache = {};

      imagesSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.productId) {
          if (!imageCache[data.productId]) {
            imageCache[data.productId] = [];
          }
          imageCache[data.productId].push({
            id: doc.id,
            ...data,
          });
        }
      });

      localStorage.setItem("productImages", JSON.stringify(imageCache));
      return imageCache;
    } catch (error) {
      console.error("Error caching product images:", error);
      return {};
    }
  };

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

      const imagePromises = productsList.map(async (product) => {
        if (!product.productId) return;

        const cachedImages = JSON.parse(
          localStorage.getItem("productImages") || "{}"
        );
        if (cachedImages[product.productId]) {
          return {
            productId: product.productId,
            images: cachedImages[product.productId],
          };
        }

        const imagesRef = collection(db, "users", uid, "productImages");
        const imagesQuery = query(
          imagesRef,
          where("productId", "==", product.productId)
        );
        const imagesSnapshot = await getDocs(imagesQuery);
        const images = imagesSnapshot.docs.map((doc) => doc.data());

        cachedImages[product.productId] = images;
        localStorage.setItem("productImages", JSON.stringify(cachedImages));

        return {
          productId: product.productId,
          images,
        };
      });

      const imageResults = await Promise.all(imagePromises);
      const cachedImages = {};
      imageResults.forEach((result) => {
        if (result) {
          cachedImages[result.productId] = result.images;
        }
      });

      productsList = productsList.map((product) => {
        if (product.productId && cachedImages[product.productId]) {
          return {
            ...product,
            productImage: cachedImages[product.productId][0]?.productImage,
          };
        }
        return product;
      });

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
        cacheProductImages(user.uid).then(() => {
          fetchProducts(user.uid);
        });
      }
    });
    return () => unsubscribe();
  }, [fetchProducts]);

  const addToCart = (product) => {
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
  };

  const removeFromCart = (productId) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId, newQuantity) => {
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
  };

  const calculateTotal = () => {
    return cart.reduce(
      (total, item) => total + item.retailPrice * item.quantity,
      0
    );
  };

  const handleCheckout = async () => {
    if (!customerInfo.name || !customerInfo.phone) {
      notifyError("Please fill in customer name and phone number");
      return;
    }

    setLoading(true);
    try {
      const orderData = {
        customerInfo,
        items: cart,
        total: calculateTotal(),
        timestamp: serverTimestamp(),
        status: "completed",
      };

      await addDoc(collection(db, "users", userUID, "orders"), orderData);

      // Update stock quantities
      const batch = writeBatch(db);
      cart.forEach((item) => {
        const productRef = doc(db, "users", userUID, "products", item.id);
        batch.update(productRef, {
          stockQty: increment(-item.quantity),
        });
      });
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
      setLoading(false);
    }
  };

  const filteredProducts = products
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

  return (
    <>
      {loading && <LoaderC />}
      <ToastContainer />
      <div className="billing-container">
        <div className="search-sort-section p-2">
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
                className="product-card"
                key={product.id}
                style={{
                  backgroundImage: product.productImage
                    ? `url(${product.productImage})`
                    : "url(https://via.placeholder.com/150)",
                }}
                onClick={() => addToCart(product)}
              >
                <div className="details">
                  <div className="p-2">
                    <p>
                      Qty: <span>{product.stockQty}</span>
                    </p>
                    <p>
                      <span>{product.productName}</span>
                    </p>
                    <p className="mt-4">MRP: ₹{product.mrp}</p>
                    <p>Price: ₹{product.retailPrice}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="cart-section">
            <h3>Cart</h3>
            <Table striped bordered hover>
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
            <div className="d-flex justify-content-between align-items-center">
              <h4>Total: ₹{calculateTotal()}</h4>
              <Button
                variant="primary"
                onClick={() => setShowCheckoutModal(true)}
                disabled={cart.length === 0}
              >
                Checkout
              </Button>
            </div>
          </div>
        </div>
      </div>

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
              <Form.Label>Customer Name</Form.Label>
              <Form.Control
                type="text"
                value={customerInfo.name}
                onChange={(e) =>
                  setCustomerInfo({ ...customerInfo, name: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Phone Number</Form.Label>
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
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCheckout}>
            Complete Order
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default Billing;
