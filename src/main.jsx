import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
