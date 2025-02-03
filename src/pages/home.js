import React, { useState, useEffect } from "react";
import { Table, Button, Modal } from "react-bootstrap";
import { db } from "../firebase/firebase";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import LoaderC from "../utills/loaderC";
import "./home.css";

const Home = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [userUID, setUserUID] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserUID(user.uid);
        fetchOrders(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchOrders = async (uid) => {
    if (!uid) return;
    setLoading(true);
    try {
      const ordersRef = collection(db, "users", uid, "orders");
      const q = query(ordersRef, orderBy("timestamp", "desc"), limit(50));
      const querySnapshot = await getDocs(q);

      const ordersData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate().toLocaleString() || "N/A",
      }));

      setOrders(ordersData);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (order) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  return (
    <>
      {loading && <LoaderC />}

      <div className="billing-history-container p-3">
        <h2 className="mb-4">Recent Orders</h2>
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.timestamp}</td>
                <td>{order.customerInfo.name}</td>
                <td>{order.items.length} items</td>
                <td>₹{order.total}</td>
                <td>
                  <Button
                    variant="info"
                    size="sm"
                    onClick={() => handleViewDetails(order)}
                  >
                    View Details
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        {/* Order Details Modal */}
        <Modal
          show={showOrderDetails}
          onHide={() => setShowOrderDetails(false)}
          size="lg"
        >
          <Modal.Header closeButton>
            <Modal.Title>Order Details</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedOrder && (
              <div>
                <h5>Customer Information</h5>
                <p>Name: {selectedOrder.customerInfo.name}</p>
                <p>Phone: {selectedOrder.customerInfo.phone}</p>
                {selectedOrder.customerInfo.email && (
                  <p>Email: {selectedOrder.customerInfo.email}</p>
                )}
                {selectedOrder.customerInfo.address && (
                  <p>Address: {selectedOrder.customerInfo.address}</p>
                )}

                <h5 className="mt-4">Items</h5>
                <Table striped bordered hover>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item, index) => (
                      <tr key={index}>
                        <td>{item.productName}</td>
                        <td>{item.quantity}</td>
                        <td>₹{item.retailPrice}</td>
                        <td>₹{item.quantity * item.retailPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                <div className="text-end mt-3">
                  <h5>Total Amount: ₹{selectedOrder.total}</h5>
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowOrderDetails(false)}
            >
              Close
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </>
  );
};

export default Home;
