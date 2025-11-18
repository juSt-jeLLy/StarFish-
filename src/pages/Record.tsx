import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Square, Languages, Clock, Download, CheckCircle } from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { WalrusEncryptUpload } from "@/components/WalrusEncryptUpload.tsx";
import { AudioRecorder, downloadAudio } from "@/utils/audioRecorder";
import { toast } from "sonner";
import spaceBg from "@/assets/space-bg.jpg";

const languages = [
  { name: "English", dialects: ["American", "British", "Australian", "Indian"] },
  { name: "Spanish", dialects: ["Castilian", "Mexican", "Argentine", "Colombian"] },
  { name: "Mandarin", dialects: ["Beijing", "Cantonese", "Taiwanese", "Sichuanese"] },
  { name: "French", dialects: ["Parisian", "Canadian", "Belgian", "Swiss"] },
  { name: "Arabic", dialects: ["Egyptian", "Levantine", "Gulf", "Maghrebi"] },
  { name: "Hindi", dialects: ["Standard", "Haryanvi", "Bhojpuri", "Rajasthani"] },
  { name: "Portuguese", dialects: ["Brazilian", "European", "African", "Asian"] },
  { name: "Bengali", dialects: ["Standard", "Chittagonian", "Sylheti", "Rajbangshi"] },
];

const durations = ["30 seconds", "1 minute", "2 minutes", "5 minutes"];

const sampleTexts = [
  "The quick brown fox jumps over the lazy dog in the bright morning sunshine, while gentle breezes carry the scent of freshly bloomed flowers across the meadow. Birds chirp melodiously in the distance, creating a symphony of natural sounds that blend harmoniously with the rustling leaves. The sky stretches endlessly above, painted in brilliant shades of blue and dotted with fluffy white clouds that drift lazily by. This peaceful scene reminds us of the simple beauty that surrounds us every day, if we only take the time to notice and appreciate it. The warmth of the sun on our skin, the softness of grass beneath our feet, and the gentle whisper of wind through the trees all combine to create a moment of pure tranquility and contentment.",
  
  "Technology is rapidly changing the way we communicate and interact with the world around us, transforming every aspect of our daily lives in ways we could never have imagined just a few decades ago. From smartphones that connect us instantly to people across the globe, to artificial intelligence that can process vast amounts of information in seconds, the pace of innovation continues to accelerate at an unprecedented rate. Social media platforms have revolutionized how we share our thoughts, experiences, and creativity with others, while cloud computing enables us to access our data from anywhere at any time. Virtual reality is beginning to blur the lines between physical and digital spaces, opening up new possibilities for education, entertainment, and collaboration. As we stand on the brink of even more dramatic technological advances, including quantum computing and advanced robotics, it becomes increasingly important to consider how these tools can be used responsibly to improve human welfare and protect our environment for future generations.",
  
  "Reading books opens up new worlds and expands our imagination beyond boundaries, allowing us to experience lives different from our own and explore places we may never physically visit. Through the written word, we can travel through time, witnessing historical events as if we were there, or journey to fantastical realms that exist only in the minds of creative authors. Books provide us with knowledge, wisdom, and perspectives that challenge our assumptions and broaden our understanding of the human experience. They offer solace in difficult times, inspiration when we need motivation, and entertainment when we seek escape from the pressures of everyday life. The act of reading itself is a form of meditation, requiring focus and engagement that pulls us away from the constant distractions of modern technology. Whether we prefer classic literature, contemporary fiction, non-fiction explorations of science and history, or poetry that captures emotions in beautiful language, books remain one of humanity's greatest inventions and most enduring sources of enlightenment and joy.",
  
  "Music has the power to move us emotionally and connect people across cultures, languages, and generations in ways that few other art forms can achieve. A simple melody can transport us back to cherished memories, evoke powerful feelings of joy or sorrow, and create bonds between strangers who share a love for the same songs or artists. Throughout human history, music has played a central role in celebrations, rituals, and everyday life, serving as a universal language that transcends barriers of communication. From the rhythmic drumming of ancient tribal ceremonies to the complex symphonies of classical composers, from the rebellious energy of rock and roll to the intricate patterns of jazz improvisation, music reflects the diversity and creativity of human expression. It has the ability to soothe our anxieties, energize our spirits, and bring communities together in shared experiences of beauty and meaning. Musicians dedicate their lives to mastering their craft, pouring their hearts into compositions and performances that touch the souls of listeners around the world.",
  
  "The ocean waves crash against the rocky shore as seabirds circle overhead, their cries echoing across the vast expanse of water that stretches to the horizon. The rhythmic sound of the surf has a hypnotic quality, drawing our attention to the eternal dance between land and sea that has continued for millions of years. Salt spray fills the air, carried on winds that have traveled across thousands of miles of open ocean. Tide pools hidden among the rocks teem with diverse marine life, from tiny crabs scuttling sideways to colorful anemones waving their tentacles in the current. The smell of seaweed and brine is strong and distinctive, a reminder of the ocean's powerful presence and its crucial role in regulating our planet's climate and supporting countless ecosystems. As the sun begins to set, painting the sky in spectacular hues of orange, pink, and purple, the ocean reflects these colors like a vast mirror, creating a breathtaking display of natural beauty that reminds us of our connection to the natural world and our responsibility to protect these precious environments.",
];

const Record = () => {
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [selectedDialect, setSelectedDialect] = useState("");
  const [selectedDuration, setSelectedDuration] = useState("");
  const [currentText, setCurrentText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState<AudioRecorder | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [visualizerData, setVisualizerData] = useState<Uint8Array | null>(null);
  const [publishedDatasetId, setPublishedDatasetId] = useState<string>("");

  const handleLanguageSelect = (language: string) => {
    setSelectedLanguage(language);
    setSelectedDialect("");
    setCurrentText("");
    setRecordedBlob(null);
    setPublishedDatasetId("");
  };

  const handleDialectSelect = (dialect: string) => {
    setSelectedDialect(dialect);
    setRecordedBlob(null);
    setPublishedDatasetId("");
  };

  const handleDurationSelect = (duration: string) => {
    setSelectedDuration(duration);
    const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    setCurrentText(randomText);
    setRecordedBlob(null);
    setPublishedDatasetId("");
  };

  const toggleRecording = async () => {
    if (isRecording && audioRecorder) {
      try {
        setIsRecording(false);
        const blob = await audioRecorder.stop();
        setRecordedBlob(blob);
        setVisualizerData(null);
        toast.success("Recording saved successfully!");
      } catch (error) {
        console.error("Error stopping recording:", error);
        toast.error("Failed to save recording");
      }
    } else {
      try {
        const recorder = new AudioRecorder((data) => {
          setVisualizerData(data);
        });
        await recorder.start();
        setAudioRecorder(recorder);
        setIsRecording(true);
        setRecordedBlob(null);
        setPublishedDatasetId("");
        toast.success("Recording started!");
      } catch (error) {
        console.error("Error starting recording:", error);
        toast.error("Failed to access microphone");
      }
    }
  };

  const handleDownload = () => {
    if (recordedBlob) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `voice-${selectedLanguage}-${selectedDialect}-${timestamp}.webm`;
      downloadAudio(recordedBlob, filename);
      toast.success("Download started!");
    }
  };

  const handlePublishSuccess = (datasetId: string) => {
    setPublishedDatasetId(datasetId);
    toast.success("Dataset published to marketplace!");
  };

  const handleNewRecording = () => {
    setSelectedDuration("");
    setCurrentText("");
    setRecordedBlob(null);
    setPublishedDatasetId("");
  };

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
        <div className="container mx-auto max-w-6xl">
          <h1 className="text-4xl md:text-6xl font-bold text-center mb-12 neon-text glitch">
            RECORD YOUR VOICE
          </h1>

          {/* Language Selection */}
          {!selectedLanguage && (
            <div className="mb-12 animate-slide-in">
              <h2 className="text-2xl font-bold mb-6 text-primary flex items-center justify-center gap-2">
                <Languages className="w-8 h-8" />
                SELECT LANGUAGE
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {languages.map((lang) => (
                  <Card
                    key={lang.name}
                    className="p-6 cursor-pointer neon-border bg-card/50 backdrop-blur hover-lift text-center"
                    onClick={() => handleLanguageSelect(lang.name)}
                  >
                    <p className="text-xl font-bold text-primary">{lang.name}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Dialect Selection */}
          {selectedLanguage && !selectedDialect && (
            <div className="mb-12 animate-slide-in">
              <Button
                variant="ghost"
                onClick={() => setSelectedLanguage("")}
                className="mb-4 text-secondary hover:text-secondary/80"
              >
                ← BACK TO LANGUAGES
              </Button>
              <h2 className="text-2xl font-bold mb-6 text-primary flex items-center justify-center gap-2">
                SELECT DIALECT FOR {selectedLanguage.toUpperCase()}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {languages
                  .find((l) => l.name === selectedLanguage)
                  ?.dialects.map((dialect) => (
                    <Card
                      key={dialect}
                      className="p-6 cursor-pointer neon-border bg-card/50 backdrop-blur hover-lift text-center"
                      onClick={() => handleDialectSelect(dialect)}
                    >
                      <p className="text-xl font-bold text-secondary">{dialect}</p>
                    </Card>
                  ))}
              </div>
            </div>
          )}

          {/* Duration Selection */}
          {selectedDialect && !selectedDuration && (
            <div className="mb-12 animate-slide-in">
              <Button
                variant="ghost"
                onClick={() => setSelectedDialect("")}
                className="mb-4 text-secondary hover:text-secondary/80"
              >
                ← BACK TO DIALECTS
              </Button>
              <h2 className="text-2xl font-bold mb-6 text-primary flex items-center justify-center gap-2">
                <Clock className="w-8 h-8" />
                SELECT DURATION
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {durations.map((duration) => (
                  <Card
                    key={duration}
                    className="p-6 cursor-pointer neon-border bg-card/50 backdrop-blur hover-lift text-center"
                    onClick={() => handleDurationSelect(duration)}
                  >
                    <p className="text-xl font-bold text-accent">{duration}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Recording Interface */}
          {currentText && (
            <div className="animate-slide-in space-y-6">
              <Button
                variant="ghost"
                onClick={handleNewRecording}
                className="mb-4 text-secondary hover:text-secondary/80"
              >
                ← START NEW RECORDING
              </Button>
              
              <Card className="p-8 neon-border bg-card/80 backdrop-blur">
                <div className="mb-6">
                  <p className="text-sm text-muted-foreground mb-2 text-center">
                    {selectedLanguage} - {selectedDialect} - {selectedDuration}
                  </p>
                  <h3 className="text-xl font-bold text-primary mb-4 text-center">READ THIS TEXT:</h3>
                  <div className="max-h-96 overflow-y-auto p-4 bg-background/50 border-2 border-primary/30">
                    <p className="text-base text-foreground leading-relaxed text-left">
                      {currentText}
                    </p>
                  </div>
                </div>

                <div className="h-48 mb-6 relative overflow-hidden neon-border bg-background/50">
                  <WaveformVisualizer 
                    dataArray={visualizerData} 
                    isRecording={isRecording} 
                  />
                </div>

                <div className="flex flex-col items-center gap-4">
                  <Button
                    size="lg"
                    onClick={toggleRecording}
                    disabled={!currentText || publishedDatasetId !== ""}
                    className={`${
                      isRecording
                        ? "bg-destructive hover:bg-destructive/90"
                        : "bg-primary hover:bg-primary/90"
                    } text-background font-bold px-12 py-8 text-xl pixel-border animate-pulse-glow`}
                  >
                    {isRecording ? (
                      <>
                        <Square className="w-8 h-8 mr-2" />
                        STOP RECORDING
                      </>
                    ) : (
                      <>
                        <Mic className="w-8 h-8 mr-2" />
                        START RECORDING
                      </>
                    )}
                  </Button>

                  {recordedBlob && !isRecording && !publishedDatasetId && (
                    <Button
                      size="lg"
                      onClick={handleDownload}
                      className="bg-accent hover:bg-accent/90 text-background font-bold px-12 py-6 text-lg pixel-border"
                    >
                      <Download className="w-6 h-6 mr-2" />
                      DOWNLOAD AUDIO
                    </Button>
                  )}
                </div>

                {isRecording && (
                  <p className="text-center text-destructive font-bold mt-4 animate-pulse">
                    RECORDING IN PROGRESS...
                  </p>
                )}

                {recordedBlob && !isRecording && !publishedDatasetId && (
                  <p className="text-center text-accent font-bold mt-4">
                    RECORDING COMPLETE! Download or publish to marketplace below.
                  </p>
                )}

                {publishedDatasetId && (
                  <div className="text-center mt-4 space-y-4">
                    <CheckCircle className="w-16 h-16 text-accent mx-auto mb-2" />
                    <div>
                      <p className="text-accent font-bold text-xl mb-3">
                        ✓ PUBLISHED TO MARKETPLACE!
                      </p>
                    </div>
                    
                    <div className="bg-background/50 border border-accent/30 rounded-lg p-4 space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Dataset Object ID:</p>
                        <a
                          href={`https://testnet.suivision.xyz/object/${publishedDatasetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent/80 underline font-mono text-xs break-all inline-block"
                        >
                          {publishedDatasetId}
                        </a>
                      </div>
                      
                      <div className="flex flex-col gap-2 pt-2">
                        <a
                          href={`https://testnet.suivision.xyz/object/${publishedDatasetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent/80 underline font-bold"
                        >
                          → View on Sui Explorer
                        </a>
                        <p className="text-xs text-muted-foreground">
                          Your dataset is now live on the blockchain and available for purchase!
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* Upload to Marketplace */}
              {recordedBlob && !isRecording && !publishedDatasetId && (
                <WalrusEncryptUpload
                  audioBlob={recordedBlob}
                  language={selectedLanguage}
                  dialect={selectedDialect}
                  duration={selectedDuration}
                  onSuccess={handlePublishSuccess}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Record;