import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { Modal, Button } from "react-bootstrap";
import imageCompression from "browser-image-compression";
import "./stock.css";
import "bootstrap/dist/css/bootstrap.min.css";

const Stock = () => {
  const [productName, setProductName] = useState("");
  const [productImage, setProductImage] = useState("");
  const [totalStock, setTotalStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [wholesaleSellPrice, setWholesaleSellPrice] = useState("");
  const [products, setProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const auth = getAuth();
  const db = getFirestore();

  useEffect(() => {
    const fetchProducts = async () => {
      const querySnapshot = await getDocs(collection(db, "products"));
      const productsList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setProducts(productsList);
    };

    fetchProducts();
  }, [db]);

  const handleDelete = async () => {
    if (editingProduct) {
      await deleteDoc(doc(db, "products", editingProduct.id));
      setProducts(
        products.filter((product) => product.id !== editingProduct.id)
      );
      setShowModal(false);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setProductName(product.productName);
    setProductImage(product.productImage);
    setTotalStock(product.totalStock);
    setMinStock(product.minStock);
    setPurchasePrice(product.purchasePrice);
    setMrp(product.mrp);
    setWholesaleSellPrice(product.wholesaleSellPrice);
    setShowModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const productRef = doc(db, "products", editingProduct.id);
    await updateDoc(productRef, {
      productName,
      productImage,
      totalStock,
      minStock,
      purchasePrice,
      mrp,
      wholesaleSellPrice,
    });
    setProducts(
      products.map((product) =>
        product.id === editingProduct.id
          ? {
              ...product,
              productName,
              productImage,
              totalStock,
              minStock,
              purchasePrice,
              mrp,
              wholesaleSellPrice,
            }
          : product
      )
    );
    setEditingProduct(null);
    setProductName("");
    setProductImage("");
    setTotalStock("");
    setMinStock("");
    setPurchasePrice("");
    setMrp("");
    setWholesaleSellPrice("");
    setShowModal(false);
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    const newProduct = {
      productName,
      productImage,
      totalStock,
      minStock,
      purchasePrice,
      mrp,
      wholesaleSellPrice,
    };
    const docRef = await addDoc(collection(db, "products"), newProduct);
    setProducts([...products, { id: docRef.id, ...newProduct }]);
    setProductName("");
    setProductImage("");
    setTotalStock("");
    setMinStock("");
    setPurchasePrice("");
    setMrp("");
    setWholesaleSellPrice("");
    setShowModal(false);
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };
      try {
        const compressedFile = await imageCompression(file, options);
        const reader = new FileReader();
        reader.onloadend = () => {
          setProductImage(reader.result);
        };
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error("Error compressing image:", error);
      }
    }
  };

  const handleShowModal = () => {
    setEditingProduct(null);
    setProductName("");
    setProductImage("");
    setTotalStock("");
    setMinStock("");
    setPurchasePrice("");
    setMrp("");
    setWholesaleSellPrice("");
    setShowModal(true);
  };

  return (
    <div className="stock-container">
      <h1>Stock Management</h1>
      <Button variant="primary" onClick={handleShowModal}>
        Add Product
      </Button>
      <table className="table table-striped table-responsive mt-4">
        <thead>
          <tr>
            <th>Product Name</th>
            <th>Product Image</th>
            <th>Total Stock</th>
            <th>Min Stock</th>
            <th>Purchase Price</th>
            <th>MRP</th>
            <th>Wholesale Sell Price</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} onClick={() => handleEdit(product)}>
              <td>{product.productName}</td>
              <td>
                <img
                  src={product.productImage}
                  alt={product.productName}
                  width="50"
                />
              </td>
              <td>{product.totalStock}</td>
              <td>{product.minStock}</td>
              <td>{product.purchasePrice}</td>
              <td>{product.mrp}</td>
              <td>{product.wholesaleSellPrice}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editingProduct ? "Edit Product" : "Add Product"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form onSubmit={editingProduct ? handleUpdate : handleAddProduct}>
            <div className="form-group">
              <label>Product Name</label>
              <input
                type="text"
                className="form-control"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Product Image</label>
              <input
                type="file"
                className="form-control"
                onChange={handleImageChange}
              />
              {productImage && (
                <img
                  src={productImage}
                  alt="Product"
                  width="100"
                  className="mt-2"
                />
              )}
            </div>
            <div className="form-group">
              <label>Total Stock</label>
              <input
                type="text"
                className="form-control"
                value={totalStock}
                onChange={(e) => setTotalStock(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Min Stock</label>
              <input
                type="text"
                className="form-control"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Purchase Price</label>
              <input
                type="text"
                className="form-control"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>MRP</label>
              <input
                type="text"
                className="form-control"
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Wholesale Sell Price</label>
              <input
                type="text"
                className="form-control"
                value={wholesaleSellPrice}
                onChange={(e) => setWholesaleSellPrice(e.target.value)}
              />
            </div>
            <Button variant="success" type="submit" className="mt-2">
              {editingProduct ? "Update Product" : "Add Product"}
            </Button>
            {editingProduct && (
              <Button
                variant="danger"
                onClick={handleDelete}
                className="mt-2 ml-2"
              >
                Delete Product
              </Button>
            )}
          </form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default Stock;
