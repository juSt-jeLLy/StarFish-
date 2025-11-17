import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";
import "@mysten/dapp-kit/dist/index.css";
import { 
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig
} from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';

// Create QueryClient
const queryClient = new QueryClient();

// Configure Sui network
const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') }
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
      <WalletProvider autoConnect={true}>
        <App />
      </WalletProvider>
    </SuiClientProvider>
  </QueryClientProvider>
);