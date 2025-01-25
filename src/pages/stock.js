import React, { useState, useEffect } from "react";
import { Button, Modal, Form, Row, Col } from "react-bootstrap";
import { db } from "../firebase/firebase"; // Ensure this is correctly pointing to your firebase config
import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import imageCompression from "browser-image-compression";

const Stock = () => {
  const [userUID, setUserUID] = useState(null);
  const [products, setProducts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    productName: "",
    productDesc: "",
    brand: "",
    bulkPrice: "",
    retailPrice: "",
    wholesalePrice: "",
    stockQty: "",
    minStock: "",
    offerValue: "",
    category: "",
    rank: "",
    productImage: null,
    purchasePrice: "",
    mrp: "",
    wholesaleSellPrice: "",
  });

  const [currentProductId, setCurrentProductId] = useState(null); // Track the current product ID for editing

  useEffect(() => {
    const auth = getAuth();
    onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUserUID(currentUser.uid);
        fetchProducts(currentUser.uid);
      }
    });
  }, []);

  // const fetchProducts = async (uid) => {
  //   const productsQuery = collection(db, "users", uid, "products");
  //   const querySnapshot = await getDocs(productsQuery);

  //   const productsList = await Promise.all(
  //     querySnapshot.docs.map(async (doc) => {
  //       const productData = { id: doc.id, ...doc.data() };
  //       const imageDoc = await getDocs(
  //         query(
  //           collection(db, "users", uid, "productImages"),
  //           where("productId", "==", productData.productId)
  //         )
  //       );
  //       if (!imageDoc.empty) {
  //         productData.productImage = imageDoc.docs[0].data().productImage;
  //       }
  //       return productData;
  //     })
  //   );

  //   setProducts(productsList);
  // };

  const fetchProducts = async (uid) => {
    const productsQuery = collection(db, "users", uid, "products");
    const querySnapshot = await getDocs(productsQuery);

    const productsList = await Promise.all(
      querySnapshot.docs.map(async (doc) => {
        const productData = { id: doc.id, ...doc.data() };

        if (productData.productId) {
          const imageDoc = await getDocs(
            query(
              collection(db, "users", uid, "productImages"),
              where("productId", "==", productData.productId)
            )
          );
          if (!imageDoc.empty) {
            productData.productImage = imageDoc.docs[0].data().productImage;
          }
        }

        return productData;
      })
    );

    setProducts(productsList);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();

    if (!userUID || !formData.productImage) return;

    const productId = generateRandomCode(8);

    // Compress and convert image to base64
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 800,
      useWebWorker: true,
    };

    const compressedFile = await imageCompression(
      formData.productImage,
      options
    );
    const base64Image = await imageCompression.getDataUrlFromFile(
      compressedFile
    );

    const newProduct = { ...formData, productId, productImage: base64Image };

    await addDoc(collection(db, "users", userUID, "products"), newProduct);

    await setDoc(doc(db, "users", userUID, "productImages", productId), {
      productId,
      productImage: base64Image,
    });

    resetForm();

    fetchProducts(userUID);
  };

  const handleEditProduct = async (e) => {
    e.preventDefault();

    if (!userUID) return;

    // Prepare data for update
    let updatedData = { ...formData };

    // Remove any undefined fields
    for (const key in updatedData) {
      if (updatedData[key] === undefined || updatedData[key] === "") {
        console.warn(`Field ${key} is undefined or empty`);
        delete updatedData[key]; // Remove undefined or empty fields
      }
    }

    // Compress and convert image to base64 if a new image is uploaded
    if (formData.productImage) {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(
        formData.productImage,
        options
      );
      updatedData.productImage = await imageCompression.getDataUrlFromFile(
        compressedFile
      );
    }

    // Update the existing product in Firestore.
    await setDoc(
      doc(db, "users", userUID, "products", currentProductId),
      updatedData
    );

    resetForm();

    fetchProducts(userUID);
  };

  const resetForm = () => {
    setFormData({
      productName: "",
      productDesc: "",
      brand: "",
      bulkPrice: "",
      retailPrice: "",
      wholesalePrice: "",
      stockQty: "",
      minStock: "",
      offerValue: "",
      category: "",
      rank: "",
      productImage: null,
      purchasePrice: "",
      mrp: "",
      wholesaleSellPrice: "",
    });

    setShowAddModal(false);
    setShowEditModal(false);
  };

  const generateRandomCode = (length) => {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join("");
  };

  const renderProductDetails = (product) => (
    <div
      className="product-card"
      key={product.id}
      style={{ backgroundImage: `url(${product.productImage})` }}
      onClick={() => openEditModal(product)} // Open edit modal on click
    >
      <div className="details">
        <div className="p-2">
          <p>Name: {product.productName}</p>
          <p>Stock Qty: {product.stockQty}</p>
          <p>MRP: {product.mrp}</p>
          <p>Retail Price: {product.retailPrice}</p>
          <p>Wholesale Price: {product.wholesalePrice}</p>
        </div>
      </div>
    </div>
  );

  const openEditModal = (product) => {
    setCurrentProductId(product.id); // Set the current product ID for editing
    setFormData({
      productName: product.productName,
      productDesc: product.productDesc,
      brand: product.brand,
      bulkPrice: product.bulkPrice,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      stockQty: product.stockQty,
      minStock: product.minStock,
      offerValue: product.offerValue,
      category: product.category,
      rank: product.rank,
      purchasePrice: product.purchasePrice,
      mrp: product.mrp,
      wholesaleSellPrice: product.wholesaleSellPrice,
      // Keep existing image unless changed
      productImage: null,
    });
    setShowEditModal(true); // Show edit modal
  };

  return (
    <div>
      <Button variant="primary" onClick={() => setShowAddModal(true)}>
        Add Product
      </Button>

      {/* Add Product Modal */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Product</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleAddProduct}>
            <Row>
              {Object.keys(formData).map((key) =>
                key !== "productImage" ? (
                  <Col xs={6} key={key}>
                    <Form.Group controlId={`form${key}`}>
                      <Form.Label>
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())}
                      </Form.Label>
                      <Form.Control
                        type={
                          key.includes("Price") || key.includes("Qty")
                            ? "number"
                            : "text"
                        }
                        name={key}
                        value={formData[key]}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                ) : (
                  <Col xs={12} key={key}>
                    <Form.Group controlId={`form${key}`}>
                      <Form.Label>Product Image</Form.Label>
                      <Form.Control
                        type="file"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            productImage: e.target.files[0],
                          })
                        }
                        required
                      />
                    </Form.Group>
                  </Col>
                )
              )}
            </Row>
            <Button variant="primary" type="submit">
              Add Product
            </Button>
          </Form>
        </Modal.Body>
      </Modal>

      {/* Edit Product Modal */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Product</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleEditProduct}>
            <Row>
              {Object.keys(formData).map((key) =>
                key !== "productImage" ? (
                  <Col xs={6} key={key}>
                    <Form.Group controlId={`edit${key}`}>
                      <Form.Label>
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())}
                      </Form.Label>
                      <Form.Control
                        type={
                          key.includes("Price") || key.includes("Qty")
                            ? "number"
                            : "text"
                        }
                        name={key}
                        value={formData[key]}
                        onChange={handleInputChange}
                        required
                      />
                    </Form.Group>
                  </Col>
                ) : (
                  <Col xs={12} key={key}>
                    <Form.Group controlId={`edit${key}`}>
                      <Form.Label>Product Image</Form.Label>
                      <Form.Control
                        type="file"
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            productImage: e.target.files[0],
                          })
                        }
                      />
                    </Form.Group>
                  </Col>
                )
              )}
            </Row>
            <Button variant="primary" type="submit">
              Update Product
            </Button>
          </Form>
        </Modal.Body>
      </Modal>

      {/* Render Products */}
      <div className="product-flex-container m-1">
        {products.map(renderProductDetails)}
      </div>

      {/* Styles */}
      <style jsx>{`
        .product-flex-container {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-around; /* Align items to the start */
          margin: -5px; /* Remove default margin */
        }
        .product-card {
          flex: 1 1 150px; /* Allow cards to grow and shrink */
          max-width: 200px; /* Set a maximum width for each card */
          height: 240px;
          position: relative;
          background-size: cover; /* Cover the entire card */
          background-repeat: no-repeat; /* No repeat */
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: flex-start; /* Align text to the top */
          color: white; /* Text color */
          margin: 5px; /* Add some spacing between cards */
        }
        .details {
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          width: 100%;
        }
      `}</style>
    </div>
  );
};

export default Stock;
