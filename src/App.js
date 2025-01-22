import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import Login from "./login/login";
import Home from "./pages/home";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/test1" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/*" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;
