import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Database, Languages, Users, Download } from "lucide-react";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";

const categories = [
  { 
    name: "English", 
    datasets: 245, 
    contributors: 1240,
    description: "Multiple accents and dialects"
  },
  { 
    name: "Spanish", 
    datasets: 189, 
    contributors: 890,
    description: "Latin American and European"
  },
  { 
    name: "Mandarin", 
    datasets: 167, 
    contributors: 756,
    description: "Various regional dialects"
  },
  { 
    name: "French", 
    datasets: 134, 
    contributors: 623,
    description: "Multiple regional accents"
  },
  { 
    name: "Arabic", 
    datasets: 123, 
    contributors: 567,
    description: "Middle Eastern dialects"
  },
  { 
    name: "Hindi", 
    datasets: 156, 
    contributors: 712,
    description: "Standard and regional"
  },
  { 
    name: "Portuguese", 
    datasets: 98, 
    contributors: 445,
    description: "Brazilian and European"
  },
  { 
    name: "Bengali", 
    datasets: 87, 
    contributors: 398,
    description: "Standard and regional"
  },
];

const mockDatasets = [
  {
    id: 1,
    title: "American English - Standard",
    samples: 150,
    duration: "2.5 hours",
    quality: "High",
    price: "0.5 ETH"
  },
  {
    id: 2,
    title: "American English - Southern Accent",
    samples: 120,
    duration: "2 hours",
    quality: "High",
    price: "0.45 ETH"
  },
  {
    id: 3,
    title: "American English - New York Accent",
    samples: 98,
    duration: "1.8 hours",
    quality: "Medium",
    price: "0.35 ETH"
  },
  {
    id: 4,
    title: "American English - Midwest Accent",
    samples: 175,
    duration: "3 hours",
    quality: "High",
    price: "0.6 ETH"
  },
];

const Marketplace = () => {
  const [selectedCategory, setSelectedCategory] = useState("");

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${spaceBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      />
      
      <div className="fixed inset-0 scanlines pointer-events-none z-10" />
      
      <Navigation />

      <div className="relative z-20 pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-7xl">
          <h1 className="text-4xl md:text-6xl font-bold text-center mb-12 neon-text glitch">
            VOICE MARKETPLACE
          </h1>

          {/* Category Selection */}
          {!selectedCategory && (
            <div className="animate-slide-in">
              <h2 className="text-2xl font-bold mb-8 text-primary flex items-center justify-center gap-2">
                <Languages className="w-8 h-8" />
                SELECT LANGUAGE CATEGORY
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {categories.map((category) => (
                  <Card
                    key={category.name}
                    className="p-6 cursor-pointer neon-border bg-card/50 backdrop-blur hover-lift"
                    onClick={() => setSelectedCategory(category.name)}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-2xl font-bold text-primary">{category.name}</h3>
                      <Database className="w-8 h-8 text-secondary animate-pulse" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      {category.description}
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-accent">
                        <Database className="w-4 h-4" />
                        <span>{category.datasets} datasets</span>
                      </div>
                      <div className="flex items-center gap-2 text-secondary">
                        <Users className="w-4 h-4" />
                        <span>{category.contributors} contributors</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Dataset Listings */}
          {selectedCategory && (
            <div className="animate-slide-in">
              <Button
                variant="ghost"
                onClick={() => setSelectedCategory("")}
                className="mb-6 text-secondary hover:text-secondary/80"
              >
                ← BACK TO CATEGORIES
              </Button>

              <h2 className="text-3xl font-bold mb-8 text-primary">
                {selectedCategory} DATASETS
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {mockDatasets.map((dataset) => (
                  <Card
                    key={dataset.id}
                    className="p-6 neon-border bg-card/80 backdrop-blur hover-lift"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-primary mb-2">
                          {dataset.title}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{dataset.samples} samples</span>
                          <span>•</span>
                          <span>{dataset.duration}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-accent animate-neon-pulse">
                          {dataset.price}
                        </div>
                        <div className={`text-xs ${
                          dataset.quality === 'High' ? 'text-primary' : 'text-secondary'
                        }`}>
                          {dataset.quality} Quality
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground/70">Audio Format:</span>
                        <span className="text-primary font-bold">MP3 320kbps</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground/70">Sample Rate:</span>
                        <span className="text-primary font-bold">48kHz</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground/70">License:</span>
                        <span className="text-primary font-bold">Commercial Use</span>
                      </div>
                    </div>

                    <Button
                      className="w-full bg-gradient-to-r from-primary to-secondary text-background font-bold py-3 hover:opacity-90 transition-all pixel-border"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      PURCHASE DATASET
                    </Button>
                  </Card>
                ))}
              </div>

              {/* Pagination placeholder */}
              <div className="flex justify-center gap-4 mt-8">
                {[1, 2, 3, 4].map((page) => (
                  <Button
                    key={page}
                    variant={page === 1 ? "default" : "outline"}
                    className={`w-12 h-12 ${
                      page === 1
                        ? "bg-primary text-background"
                        : "border-primary text-primary hover:bg-primary/20"
                    }`}
                  >
                    {page}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Marketplace;
