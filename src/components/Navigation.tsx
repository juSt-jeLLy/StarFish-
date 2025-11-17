import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mic, Database, Home } from "lucide-react";
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { useState } from "react";

const Navigation = () => {
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const currentAccount = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();

  const isConnected = !!currentAccount;
  const walletAddress = currentAccount?.address;

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-sm border-b-4 border-primary">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary p-[2px] animate-pulse-glow">
                <div className="w-full h-full bg-background flex items-center justify-center">
                  <Mic className="w-6 h-6 text-primary" />
                </div>
              </div>
              <span className="text-xl font-bold neon-text hidden sm:block">
                VOICEDATA
              </span>
            </Link>

            <div className="flex items-center gap-4">
              <Link to="/" className="hidden md:block">
                <Button 
                  variant="ghost" 
                  className="hover:bg-primary/20 hover:text-primary transition-all"
                >
                  <Home className="w-4 h-4 mr-2" />
                  HOME
                </Button>
              </Link>
              
              <Link to="/record">
                <Button 
                  variant="ghost" 
                  className="hover:bg-primary/20 hover:text-primary transition-all"
                >
                  <Mic className="w-4 h-4 mr-2" />
                  RECORD
                </Button>
              </Link>

              <Link to="/marketplace">
                <Button 
                  variant="ghost" 
                  className="hover:bg-primary/20 hover:text-primary transition-all"
                >
                  <Database className="w-4 h-4 mr-2" />
                  MARKET
                </Button>
              </Link>

              {isConnected ? (
                <>
                  <div className="text-sm bg-green-500/20 text-green-400 px-3 py-2 rounded border border-green-500/30">
                    {walletAddress 
                      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                      : 'Connected'
                    }
                  </div>
                  <Button 
                    onClick={() => disconnect()}
                    className="bg-gradient-to-r from-red-500 to-red-600 text-white font-bold px-6 hover:opacity-90 transition-all"
                  >
                    DISCONNECT
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={() => setConnectModalOpen(true)}
                  className="bg-gradient-to-r from-primary to-secondary text-background font-bold px-6 hover:opacity-90 transition-all animate-pulse-glow"
                >
                  CONNECT WALLET
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Sui Wallet Connect Modal */}
      <ConnectModal
        trigger={<div style={{ display: 'none' }} />}
        open={connectModalOpen}
        onOpenChange={(isOpen) => setConnectModalOpen(isOpen)}
      />
    </>
  );
};

export default Navigation;