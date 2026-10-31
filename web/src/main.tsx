import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loadDeployment } from "./config";
import App from "./App";
import "./styles.css";
const root = createRoot(document.getElementById("root")!);
const queries = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});
loadDeployment()
  .then((r) =>
    root.render(
      <StrictMode>
        <WagmiProvider config={r.wagmi}>
          <QueryClientProvider client={queries}>
            <App r={r} />
          </QueryClientProvider>
        </WagmiProvider>
      </StrictMode>,
    ),
  )
  .catch((error) =>
    root.render(
      <main className="boot-error">
        <img src="./favicon.svg" width="64" height="64" alt="" />
        <h1>Hamster Nap</h1>
        <p role="alert">
          {error instanceof Error
            ? error.message
            : "Deployment configuration could not be verified."}
        </p>
        <button
          type="button"
          className="primary"
          onClick={() => location.reload()}
        >
          Reload game
        </button>
      </main>,
    ),
  );
