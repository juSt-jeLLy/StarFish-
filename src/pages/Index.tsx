import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mic, Globe, Database, Sparkles } from "lucide-react";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";
import micIcon from "@/assets/mic-icon.png";

const Index = () => {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Parallax Background */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${spaceBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      />
      
      {/* Scanlines Effect */}
      <div className="fixed inset-0 scanlines pointer-events-none z-10" />
      
      <Navigation />

      {/* Hero Section */}
      <section className="relative z-20 min-h-screen flex items-center justify-center pt-20">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-8 animate-slide-in">
            <div className="flex justify-center mb-8">
              <img 
                src={micIcon} 
                alt="Microphone" 
                className="w-32 h-32 animate-float"
              />
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold neon-text glitch">
              VOICE DATA
              <br />
              MARKETPLACE
            </h1>
            
            <p className="text-lg md:text-xl text-primary max-w-2xl mx-auto">
              Record your voice in multiple languages, dialects, and accents.
              <br />
              Sell your voice datasets to AI companies worldwide.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
              <Link to="/record">
                <Button 
                  size="lg"
                  className="bg-primary text-background hover:bg-primary/90 font-bold px-8 py-6 text-lg pixel-border hover-lift"
                >
                  <Mic className="w-6 h-6 mr-2" />
                  START RECORDING
                </Button>
              </Link>
              
              <Link to="/marketplace">
                <Button 
                  size="lg"
                  variant="outline"
                  className="border-2 border-secondary text-secondary hover:bg-secondary/20 font-bold px-8 py-6 text-lg hover-lift"
                >
                  <Database className="w-6 h-6 mr-2" />
                  BROWSE DATASETS
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-20 py-20 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 neon-text">
            HOW IT WORKS
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Globe,
                title: "SELECT LANGUAGE",
                description: "Choose from multiple languages, dialects, and accents",
                color: "primary"
              },
              {
                icon: Mic,
                title: "RECORD VOICE",
                description: "Read provided text and record high-quality audio",
                color: "secondary"
              },
              {
                icon: Database,
                title: "EARN REWARDS",
                description: "Your voice datasets are available for AI training",
                color: "accent"
              }
            ].map((feature, index) => (
              <div
                key={index}
                className="p-6 neon-border bg-card/50 backdrop-blur hover-lift animate-slide-in"
                style={{ animationDelay: `${index * 0.2}s` }}
              >
                <div className="flex justify-center mb-4">
                  <div className={`w-16 h-16 bg-${feature.color} flex items-center justify-center animate-pulse-glow`}>
                    <feature.icon className="w-8 h-8 text-background" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-center mb-3 text-primary">
                  {feature.title}
                </h3>
                <p className="text-center text-foreground/80">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-20 py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {[
              { number: "50+", label: "LANGUAGES" },
              { number: "1000+", label: "DATASETS" },
              { number: "100+", label: "AI COMPANIES" }
            ].map((stat, index) => (
              <div 
                key={index}
                className="p-8 pixel-border bg-card/30 backdrop-blur hover-lift"
              >
                <div className="text-5xl md:text-6xl font-bold neon-text mb-2 animate-neon-pulse">
                  {stat.number}
                </div>
                <div className="text-xl text-secondary">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-20 py-20 bg-gradient-to-b from-background/50 to-background/90">
        <div className="container mx-auto px-4 text-center">
          <Sparkles className="w-16 h-16 text-accent mx-auto mb-6 animate-float" />
          <h2 className="text-3xl md:text-5xl font-bold mb-6 neon-text">
            READY TO GET STARTED?
          </h2>
          <p className="text-xl text-primary mb-8 max-w-2xl mx-auto">
            Join thousands of voice contributors and start earning today
          </p>
          <Link to="/record">
            <Button 
              size="lg"
              className="bg-gradient-to-r from-primary via-secondary to-accent text-background font-bold px-12 py-6 text-xl hover:opacity-90 transition-all animate-pulse-glow"
            >
              START NOW
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Index;
