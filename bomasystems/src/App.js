/**
 * App.js — Boma System routes
 *
 * "/"          → redirects to /login
 * "/login"     → Auth sign-in (Firebase Auth + Firestore profile check)
 * "/dashboard" → Boma System dashboard (guards itself: redirects to /login when signed out)
 * anything else → back to /login
 *
 * The router lives here. index.js only renders <App />.
 */
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./Components/Auth";
import Dashboard from "./Components/Dashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;