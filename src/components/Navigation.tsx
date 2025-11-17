import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mic, Database, Home } from "lucide-react";

const Navigation = () => {
  return (
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

            <Button 
              className="bg-gradient-to-r from-primary to-secondary text-background font-bold px-6 hover:opacity-90 transition-all animate-pulse-glow"
            >
              CONNECT WALLET
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
