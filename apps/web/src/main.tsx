import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import DocumentTitleManager from "./components/DocumentTitleManager";
import ErrorBoundary from "./components/ErrorBoundary";
import { RuntimeConfigProvider } from "./config/runtimeConfig";
import { initFileDb } from "./services/fileStorage";
import "./styles/app.css";
import "./styles/print.css";

void initFileDb();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <DocumentTitleManager />
        <ErrorBoundary>
          <RuntimeConfigProvider>
            <App />
          </RuntimeConfigProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>
  );
}
