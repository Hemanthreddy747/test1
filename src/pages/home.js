import React from "react";
import { auth } from "../firebase/firebase"; // Adjust the path as necessary
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div>
      <h1>Welcome to the Home Page!</h1>
      <button onClick={handleLogout}>Sign Out...</button>
    </div>
  );
};

export default Home;
