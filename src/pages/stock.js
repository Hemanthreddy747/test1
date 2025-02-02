// Part 1: Imports and Initial Setup
import React, { useState, useEffect, useCallback } from "react";
import { Button, Modal, Form, Row, Col } from "react-bootstrap";
import { db } from "../firebase/firebase";
import { ToastContainer, toast } from "react-toastify";
import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  limit,
  startAfter,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import imageCompression from "browser-image-compression";
import "./stock.css";
import LoaderC from "../utills/loaderC";
import BatchUpload from "./batchUpload";

const Stock = () => {
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  // ============= NOTIFICATION HELPERS =============
  const notifyError = (message) => toast.error(message);
  const notifySuccess = (message) => toast.success(message);

  // ============= STATE MANAGEMENT =============
  // UI States
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // User State
  const [userUID, setUserUID] = useState(null);

  // Product States
  const [products, setProducts] = useState([]);
  const [activeProducts, setActiveProducts] = useState([]);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [currentProductId, setCurrentProductId] = useState(null);

  // Pagination States
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const PRODUCTS_PER_PAGE = 400;

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("");

  // Form Data State
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
    archived: false,
  });

  // ============= AUTHENTICATION & INITIAL LOAD =============
  useEffect(() => {
    const auth = getAuth();
    onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUserUID(currentUser.uid);
        fetchProducts(currentUser.uid);
      }
    });
  }, []);

  // ============= SEARCH & SORT FUNCTIONALITY =============
  useEffect(() => {
    handleSearchAndSort();
  }, [searchTerm, sortOption, products]);

  const handleSearchAndSort = () => {
    let filteredProducts = [...products];

    // Apply search filter
    if (searchTerm) {
      filteredProducts = filteredProducts.filter((product) =>
        product.productName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    if (sortOption === "name") {
      filteredProducts.sort((a, b) =>
        a.productName.localeCompare(b.productName)
      );
    } else if (sortOption === "stockQty") {
      filteredProducts.sort((a, b) => a.stockQty - b.stockQty);
    }

    // Separate active and archived products
    setActiveProducts(filteredProducts.filter((product) => !product.archived));
    setArchivedProducts(filteredProducts.filter((product) => product.archived));
  };

  // ============= INFINITE SCROLL FUNCTIONALITY =============
  const handleScroll = useCallback(() => {
    if (
      window.innerHeight + document.documentElement.scrollTop ===
      document.documentElement.offsetHeight
    ) {
      if (hasMore && !loading) {
        fetchProducts(userUID, true);
      }
    }
  }, [hasMore, loading, userUID]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // ============= IMAGE HANDLING =============
  useEffect(() => {
    if (userUID) {
      cacheProductImages(userUID);
    }
  }, [userUID]);

  const cacheProductImages = async (uid) => {
    try {
      const imagesQuery = collection(db, "users", uid, "productImages");
      const imagesSnapshot = await getDocs(imagesQuery);
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
      notifyError("Error caching product images");
      return {};
    }
  };

  // ============= PRODUCT CRUD OPERATIONS =============
  // In the Stock component, modify the fetchProducts function:

  const fetchProducts = async (uid, loadMore = false, forceRefresh = false) => {
    setLoading(true);
    try {
      // Clear existing data if it's a force refresh
      if (forceRefresh) {
        setProducts([]);
        setLastDoc(null);
        setHasMore(true);
      }

      let productsQuery = collection(db, "users", uid, "products");
      productsQuery = query(productsQuery, limit(PRODUCTS_PER_PAGE));

      if (loadMore && lastDoc && !forceRefresh) {
        productsQuery = query(productsQuery, startAfter(lastDoc));
      }

      const querySnapshot = await getDocs(productsQuery);

      if (querySnapshot.docs.length < PRODUCTS_PER_PAGE) {
        setHasMore(false);
      }

      setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);

      // Clear local storage cache if it's a force refresh
      if (forceRefresh) {
        localStorage.removeItem("productImages");
        await cacheProductImages(uid);
      }

      const cachedImages = JSON.parse(
        localStorage.getItem("productImages") || "{}"
      );

      const productsList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      productsList.forEach((product) => {
        if (product.productId && cachedImages[product.productId]) {
          product.productImage =
            cachedImages[product.productId][0]?.productImage;
        }
      });

      setProducts((prev) =>
        loadMore && !forceRefresh ? [...prev, ...productsList] : productsList
      );
    } catch (error) {
      notifyError("Error fetching products");
      console.error("Fetch products error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userUID || !formData.productImage) return;

      const batch = writeBatch(db);
      const productId = generateRandomCode(8);

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

      const newProduct = {
        ...formData,
        productId,
        archived: false,
        createdAt: serverTimestamp(),
      };
      delete newProduct.productImage;

      const productRef = doc(collection(db, "users", userUID, "products"));
      const imageRef = doc(db, "users", userUID, "productImages", productId);

      batch.set(productRef, newProduct);
      batch.set(imageRef, {
        productId,
        productImage: base64Image,
      });

      await batch.commit();

      // Update local cache
      const cachedImages = JSON.parse(
        localStorage.getItem("productImages") || "{}"
      );
      cachedImages[productId] = [
        {
          productId,
          productImage: base64Image,
        },
      ];
      localStorage.setItem("productImages", JSON.stringify(cachedImages));

      notifySuccess("Product added successfully");
      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
      notifyError("Error adding product");
    } finally {
      setLoading(false);
    }
  };

  // ============= EDIT AND DELETE OPERATIONS =============
  const handleEditProduct = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!userUID) return;

      const batch = writeBatch(db);
      let updatedData = { ...formData };
      delete updatedData.productImage;

      // Remove empty fields
      Object.keys(updatedData).forEach((key) => {
        if (updatedData[key] === undefined || updatedData[key] === "") {
          delete updatedData[key];
        }
      });

      updatedData.updatedAt = serverTimestamp();

      // Update product document
      const productRef = doc(
        db,
        "users",
        userUID,
        "products",
        currentProductId
      );
      batch.set(productRef, updatedData, { merge: true });

      // Handle image update if new image is provided
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
        const base64Image = await imageCompression.getDataUrlFromFile(
          compressedFile
        );

        const imageRef = doc(
          db,
          "users",
          userUID,
          "productImages",
          updatedData.productId
        );
        batch.set(imageRef, {
          productId: updatedData.productId,
          productImage: base64Image,
        });

        // Update local cache
        const cachedImages = JSON.parse(
          localStorage.getItem("productImages") || "{}"
        );
        cachedImages[updatedData.productId] = [
          {
            productId: updatedData.productId,
            productImage: base64Image,
          },
        ];
        localStorage.setItem("productImages", JSON.stringify(cachedImages));
      }

      await batch.commit();
      notifySuccess("Product updated successfully");
      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
      notifyError("Error updating product");
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveProduct = async () => {
    if (!userUID || !currentProductId) return;

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const productRef = doc(
        db,
        "users",
        userUID,
        "products",
        currentProductId
      );

      batch.update(productRef, {
        archived: !formData.archived,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      notifySuccess(
        `Product ${formData.archived ? "unarchived" : "archived"} successfully`
      );
      resetForm();
      await fetchProducts(userUID);
    } catch (error) {
      notifyError("Error archiving product");
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!userUID || !currentProductId) return;

    if (
      window.confirm(
        "Are you sure you want to permanently delete this product? This action cannot be undone."
      )
    ) {
      setLoading(true);
      try {
        const batch = writeBatch(db);

        // Delete product document
        const productRef = doc(
          db,
          "users",
          userUID,
          "products",
          currentProductId
        );
        batch.delete(productRef);

        // Delete associated image
        if (formData.productId) {
          const imageRef = doc(
            db,
            "users",
            userUID,
            "productImages",
            formData.productId
          );
          batch.delete(imageRef);

          // Update local cache
          const cachedImages = JSON.parse(
            localStorage.getItem("productImages") || "{}"
          );
          delete cachedImages[formData.productId];
          localStorage.setItem("productImages", JSON.stringify(cachedImages));
        }

        await batch.commit();
        notifySuccess("Product deleted successfully");
        resetForm();
        await fetchProducts(userUID);
      } catch (error) {
        notifyError("Error deleting product");
      } finally {
        setLoading(false);
      }
    }
  };

  // ============= FORM HANDLING =============
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAddNewClick = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (product) => {
    setCurrentProductId(product.id);
    setFormData({
      ...product,
      productImage: product.productImage,
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      productName: "",
      productDesc: "",
      brand: "",
      category: "",
      bulkPrice: "",
      retailPrice: "",
      wholesalePrice: "",
      stockQty: "",
      minStock: "",
      offerValue: "",
      rank: "",
      purchasePrice: "",
      mrp: "",
      archived: false,
      productImage: null,
    });

    setShowAddModal(false);
    setShowEditModal(false);
  };

  // ============= UTILITY FUNCTIONS =============
  const generateRandomCode = (length) => {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join("");
  };

  // ============= RENDER UI =============
  return (
    <>
      {loading && <LoaderC />}
      <div>
        <ToastContainer />

        {/* Search and Add New Section */}

        <div className="d-flex justify-content-between mb-2 mt-2 ms-1 me-1 gap-1">
          <input
            type="text"
            placeholder="Search by name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control w-50"
          />
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="form-control w-25"
          >
            <option value="">Sort By</option>
            <option value="name">Product Name</option>
            <option value="stockQty">Stock Quantity</option>
          </select>
          <Button variant="primary" onClick={handleAddNewClick}>
            Add New
          </Button>
        </div>

        {/* Add Product Modal */}
        <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Add Product</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleAddProduct}>
              <Row>
                {Object.keys(formData).map((key) =>
                  key !== "productImage" && key !== "archived" ? (
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
                  ) : key === "productImage" ? (
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
                  ) : null
                )}
              </Row>
              <Button variant="primary" type="submit" className="mt-3">
                Add Product
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAddModal(false);
                  setShowBatchUploadModal(true);
                }}
                className="ms-2 mt-3"
              >
                Batch Upload
              </Button>
            </Form>
          </Modal.Body>
        </Modal>

        <BatchUpload
          userUID={userUID}
          show={showBatchUploadModal}
          handleClose={() => setShowBatchUploadModal(false)}
          fetchProducts={(uid, loadMore = false, forceRefresh = false) =>
            fetchProducts(uid, loadMore, forceRefresh)
          }
        />

        {/* Edit Product Modal */}
        <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Edit Product</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleEditProduct}>
              <Row>
                {Object.keys(formData).map((key) =>
                  key !== "productImage" && key !== "archived" ? (
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
                  ) : key === "productImage" ? (
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
                  ) : null
                )}
              </Row>
              <div className="d-flex justify-content-between mt-3">
                <Button variant="primary" type="submit">
                  Update Product
                </Button>
                <div>
                  <Button
                    variant="warning"
                    type="button"
                    onClick={handleArchiveProduct}
                    className="me-2"
                  >
                    {formData.archived ? "Unarchive" : "Archive"} Product
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    onClick={handlePermanentDelete}
                  >
                    Delete Permanently
                  </Button>
                </div>
              </div>
            </Form>
          </Modal.Body>
        </Modal>

        {/* Active Products Grid */}
        <div className="product-flex-container m-1">
          {activeProducts.length > 0 ? (
            activeProducts.map((product) => (
              <div
                className="product-card"
                key={product.id}
                style={{ backgroundImage: `url(${product.productImage})` }}
                onClick={() => openEditModal(product)}
              >
                <div className="details">
                  <div className="p-2">
                    <p>
                      Qty: <span>{product.stockQty}</span>
                    </p>
                    <p>
                      <span>{product.productName}</span>
                    </p>
                    <p className="mt-4">MRP: {product.mrp}</p>
                    <p>Bulk Price: {product.wholesalePrice}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div
              className="product-card"
              style={{
                backgroundImage: `url('https://img.freepik.com/free-photo/vertical-banners-sales_23-2150629840.jpg')`,
              }}
            >
              <div className="details">
                <div className="p-2">
                  <p>
                    Qty: <span>99</span>
                  </p>
                  <p>
                    <span>Sample Product</span>
                  </p>
                  <p className="mt-4">MRP: 0.00</p>
                  <p>Bulk Price: 0.00</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Archived Products Grid */}
        {archivedProducts.length > 0 && (
          <div className="product-flex-container m-1">
            {archivedProducts.map((product) => (
              <div
                className="product-card archived"
                key={product.id}
                style={{ backgroundImage: `url(${product.productImage})` }}
                onClick={() => openEditModal(product)}
              >
                <div className="details">
                  <div className="p-2">
                    <div className="archived-badge">Archived</div>
                    <p>
                      QTY: <span>{product.stockQty}</span>
                    </p>
                    <p>
                      <span>{product.productName}</span>
                    </p>
                    <p className="mt-4">MRP: {product.mrp}</p>
                    <p>Wholesale Price: {product.wholesalePrice}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Styles */}
        <style jsx>{`
          .product-flex-container {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-start;
            gap: 7px;
          }
          .product-card {
            flex: 1 1 100px;
            max-width: 125px;
            height: 160px;
            position: relative;
            background-size: 100%;
            background-repeat: no-repeat;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: rgba(14, 30, 37, 0.12) 0px 2px 4px 0px,
              rgba(14, 30, 37, 0.32) 0px 2px 16px 0px;
            display: flex;
            align-items: flex-start;
            color: white;
            cursor: pointer;
          }
          .details {
            height: 100%;
            color: white;
            background-color: rgba(58, 62, 70, 0.68);
            width: 100%;
          }
          .archived {
            opacity: 0.7;
          }
          .archived-badge {
            background-color: #dc3545;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.8em;
            position: absolute;
            top: 5px;
            right: 5px;
          }
        `}</style>
      </div>
    </>
  );
};

export default Stock;
