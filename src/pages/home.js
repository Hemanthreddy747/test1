import React, { useState, useEffect } from "react";
import { Table, Button, Card, Modal, Pagination } from "react-bootstrap";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../firebase/firebase";
import LoaderC from "../utills/loaderC";
import * as XLSX from "xlsx";
import { toast } from "react-toastify";

const Home = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userUID, setUserUID] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;

  useEffect(() => {
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
        timestamp: doc.data().timestamp?.toDate() || new Date(),
        formattedDate: doc.data().timestamp?.toDate().toLocaleString() || "N/A",
      }));

      setOrders(ordersData);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error("Error fetching orders");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (order) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  const isToday = (date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const todaysOrders = orders.filter((order) => isToday(order.timestamp));
  const todaysTotalSales = todaysOrders.reduce(
    (total, order) => total + order.total,
    0
  );

  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentTodaysOrders = todaysOrders.slice(
    indexOfFirstOrder,
    indexOfLastOrder
  );
  const totalPages = Math.ceil(todaysOrders.length / ordersPerPage);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const downloadSalesData = () => {
    try {
      // Prepare data for Excel
      const salesData = orders.map((order) => ({
        Date: order.formattedDate,
        "Customer Name": order.customerInfo.name,
        "Customer Phone": order.customerInfo.phone,
        "Customer Email": order.customerInfo.email || "N/A",
        "Customer Address": order.customerInfo.address || "N/A",
        "Total Amount": order.total,
        "Number of Items": order.items.length,
        "Order ID": order.id,
      }));

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(salesData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Data");

      // Save file
      XLSX.writeFile(wb, "sales_data.xlsx");
      toast.success("Sales data downloaded successfully");
    } catch (error) {
      console.error("Error downloading sales data:", error);
      toast.error("Error downloading sales data");
    }
  };

  const PaginationComponent = ({ totalPages, currentPage, onPageChange }) => {
    let items = [];
    for (let number = 1; number <= totalPages; number++) {
      items.push(
        <Pagination.Item
          key={number}
          active={number === currentPage}
          onClick={() => onPageChange(number)}
        >
          {number}
        </Pagination.Item>
      );
    }
    return <Pagination>{items}</Pagination>;
  };

  const OrdersTable = ({ orders, showPagination = false }) => (
    <>
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
              <td>{order.formattedDate}</td>
              <td>{order.customerInfo.name}</td>
              <td>{order.items.length}</td>
              <td>₹{order.total}</td>
              <td>
                <Button
                  variant="info"
                  size="sm"
                  onClick={() => handleViewDetails(order)}
                >
                  Details
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {showPagination && totalPages > 1 && (
        <div className="d-flex justify-content-center mt-3">
          <PaginationComponent
            totalPages={totalPages}
            currentPage={currentPage}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </>
  );

  return (
    <>
      {loading && <LoaderC />}

      <div className="billing-history-container p-3">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <Card className="text-center p-0 flex-grow-1 me-3">
            <Card.Body>
              <Card.Title>Today's Total Sales</Card.Title>
              <Card.Text className="h2 text-success">
                ₹{todaysTotalSales}
              </Card.Text>
            </Card.Body>
          </Card>
          <Button variant="success" onClick={downloadSalesData}>
            Download Sales Data
          </Button>
        </div>

        <div>
          <h3 className="mb-3">
            Today's Orders ({todaysOrders.length} orders)
          </h3>
          <OrdersTable orders={currentTodaysOrders} showPagination={true} />
        </div>

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
