import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Record from "./pages/Record";
import Marketplace from "./pages/Marketplace";
import NotFound from "./pages/NotFound";
import MySubscriptions from "@/pages/MySubscriptions";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/record" element={<Record />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/subscriptions" element={<MySubscriptions />} />


        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;