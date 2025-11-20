import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Mic, Database, ShoppingBag } from "lucide-react";
import { ConnectButton } from '@mysten/dapp-kit';

const Navigation = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-30 bg-background/80 backdrop-blur-md border-b-2 border-primary/30">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-2xl font-bold neon-text hover:opacity-80 transition-opacity">
              STARFISH
            </Link>
            
            <div className="hidden md:flex gap-4">
              <Link to="/">
                <Button variant="ghost" className="text-primary hover:text-primary/80">
                  <Home className="w-5 h-5 mr-2" />
                  HOME
                </Button>
              </Link>
              
              <Link to="/record">
                <Button variant="ghost" className="text-secondary hover:text-secondary/80">
                  <Mic className="w-5 h-5 mr-2" />
                  RECORD
                </Button>
              </Link>
              
              <Link to="/marketplace">
                <Button variant="ghost" className="text-accent hover:text-accent/80">
                  <Database className="w-5 h-5 mr-2" />
                  MARKETPLACE
                </Button>
              </Link>

              <Link to="/subscriptions">
                <Button variant="ghost" className="text-accent hover:text-accent/80">
                  <ShoppingBag className="w-5 h-5 mr-2" />
                  MY SUBSCRIPTIONS
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ConnectButton 
              className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:from-primary/90 hover:to-secondary/90 pixel-border font-bold transition-all duration-200"
            />
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden flex gap-2 mt-4 flex-wrap">
          <Link to="/" className="flex-1">
            <Button variant="ghost" size="sm" className="w-full text-primary">
              <Home className="w-4 h-4 mr-1" />
              HOME
            </Button>
          </Link>
          
          <Link to="/record" className="flex-1">
            <Button variant="ghost" size="sm" className="w-full text-secondary">
              <Mic className="w-4 h-4 mr-1" />
              RECORD
            </Button>
          </Link>
          
          <Link to="/marketplace" className="flex-1">
            <Button variant="ghost" size="sm" className="w-full text-accent">
              <Database className="w-4 h-4 mr-1" />
              MARKET
            </Button>
          </Link>

          <Link to="/subscriptions" className="flex-1">
            <Button variant="ghost" size="sm" className="w-full text-accent">
              <ShoppingBag className="w-4 h-4 mr-1" />
              MY SUBS
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;