import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import App from "./App";
import { wagmiConfig } from "./config/wagmi";
import "./index.css";
import { SignerProvider } from "./signer/SignerContext";

// keep polling even when the tab is not focused: the escrow state is driven by other parties
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchIntervalInBackground: true } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#5eead4", accentColorForeground: "#08131a" })}>
          <SignerProvider>
            <App />
          </SignerProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
