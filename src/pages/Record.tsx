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

interface DatasetInfo {
  blobId: string;
  datasetId: string;
  txDigest: string;
}

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

const languageTexts: { [key: string]: string[] } = {
  English: [
    "The quick brown fox jumps over the lazy dog while birds sing in the morning sunshine. Gentle breezes carry the scent of fresh flowers across the peaceful meadow.",
    "Technology transforms how we communicate and interact with the world around us. Innovation continues to accelerate, opening new possibilities for education and collaboration.",
    "Reading books opens new worlds and expands our imagination beyond boundaries. Stories allow us to experience lives different from our own and explore distant places."
  ],
  Spanish: [
    "El rápido zorro marrón salta sobre el perro perezoso bajo el cálido sol de la mañana. Los pájaros cantan alegremente mientras la brisa acaricia los campos verdes.",
    "La tecnología moderna transforma nuestra forma de vivir y comunicarnos cada día. Los avances nos conectan con personas de todo el mundo instantáneamente.",
    "La lectura de libros abre puertas a nuevos mundos llenos de imaginación y conocimiento. Cada historia nos transporta a lugares mágicos y experiencias únicas."
  ],
  Mandarin: [
    "快速的棕色狐狸跳过懒狗，在温暖的阳光下。鸟儿在清晨歌唱，微风轻轻吹过绿色的田野，带来花香和宁静。",
    "现代技术改变了我们的生活方式和沟通方式。创新不断加速，为教育和合作开辟了新的可能性。",
    "阅读书籍打开了通往新世界的大门，扩展了我们的想象力。故事让我们体验不同的生活，探索遥远的地方。"
  ],
  French: [
    "Le rapide renard brun saute par-dessus le chien paresseux sous le soleil chaud du matin. Les oiseaux chantent joyeusement dans la brise légère des champs verts.",
    "La technologie moderne transforme notre façon de vivre et de communiquer chaque jour. Les progrès nous connectent avec des personnes du monde entier instantanément.",
    "La lecture de livres ouvre des portes vers de nouveaux mondes pleins d'imagination et de connaissances. Chaque histoire nous transporte vers des lieux magiques."
  ],
  Arabic: [
    "يقفز الثعلب البني السريع فوق الكلب الكسول تحت أشعة الشمس الدافئة. الطيور تغني بسعادة في النسيم الخفيف للحقول الخضراء.",
    "تغير التكنولوجيا الحديثة طريقة عيشنا وتواصلنا كل يوم. التقدم يربطنا بأشخاص من جميع أنحاء العالم على الفور.",
    "فتح الكتب أبوابًا لعوالم جديدة مليئة بالخيال والمعرفة. كل قصة تنقلنا إلى أماكن سحرية وتجارب فريدة."
  ],
  Hindi: [
    "तेज भूरी लोमड़ी आलसी कुत्ते के ऊपर कूदती है, गर्म धूप में। पक्षी हरे खेतों की हल्की हवा में खुशी से गाते हैं।",
    "आधुनिक प्रौद्योगिकी हर दिन हमारे जीने और संवाद करने के तरीके को बदल रही है। प्रगति हमें तुरंत दुनिया भर के लोगों से जोड़ती है।",
    "किताबें पढ़ना कल्पना और ज्ञान से भरी नई दुनिया के दरवाजे खोलती है। हर कहानी हमें जादुई स्थानों और अनूठे अनुभवों में ले जाती है।"
  ],
  Portuguese: [
    "A rápida raposa marrom pula sobre o cão preguiçoso sob o sol quente da manhã. Os pássaros cantam alegremente na brisa leve dos campos verdes.",
    "A tecnologia moderna transforma nossa forma de viver e nos comunicar a cada dia. Os avanços nos conectam com pessoas de todo o mundo instantaneamente.",
    "A leitura de livros abre portas para novos mundos cheios de imaginação e conhecimento. Cada história nos transporta para lugares mágicos e experiências únicas."
  ],
  Bengali: [
    "দ্রুত বাদামি শিয়াল উষ্ণ সকালের রোদে অলস কুকুরের উপর দিয়ে লাফ দেয়। পাখিরা সবুজ মাঠের হালকা বাতাসে খুশিতে গান গায়।",
    "আধুনিক প্রযুক্তি প্রতিদিন আমাদের বেঁচে থাকা এবং যোগাযোগের way তরীকে রূপান্তরিত করে। অগ্রগতি আমাদের সাথে সারা বিশ্বের মানুষকে তাত্ক্ষণিকভাবে সংযুক্ত করে।",
    "বই পড়া কল্পনা ও জ্ঞানপূর্ণ নতুন বিশ্বের দরজা খুলে দেয়। প্রতিটি গল্প আমাদের জাদুকরী জায়গা এবং অনন্য অভিজ্ঞতায় নিয়ে যায়।"
  ]
};

const Record = () => {
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [selectedDialect, setSelectedDialect] = useState("");
  const [selectedDuration, setSelectedDuration] = useState("");
  const [currentText, setCurrentText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState<AudioRecorder | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [visualizerData, setVisualizerData] = useState<Uint8Array | null>(null);
  const [publishedDataset, setPublishedDataset] = useState<DatasetInfo | null>(null);

  const handleLanguageSelect = (language: string) => {
    setSelectedLanguage(language);
    setSelectedDialect("");
    setCurrentText("");
    setRecordedBlob(null);
    setPublishedDataset(null);
  };

  const handleDialectSelect = (dialect: string) => {
    setSelectedDialect(dialect);
    setRecordedBlob(null);
    setPublishedDataset(null);
  };

  const handleDurationSelect = (duration: string) => {
    setSelectedDuration(duration);
    const texts = languageTexts[selectedLanguage] || languageTexts.English;
    const randomText = texts[Math.floor(Math.random() * texts.length)];
    setCurrentText(randomText);
    setRecordedBlob(null);
    setPublishedDataset(null);
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
        setPublishedDataset(null);
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

  const handlePublishSuccess = (datasetInfo: DatasetInfo) => {
    setPublishedDataset(datasetInfo);
    toast.success("Dataset published to marketplace!");
  };

  const handleNewRecording = () => {
    setSelectedDuration("");
    setCurrentText("");
    setRecordedBlob(null);
    setPublishedDataset(null);
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
                    disabled={!currentText || publishedDataset !== null}
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

                  {recordedBlob && !isRecording && !publishedDataset && (
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

                {recordedBlob && !isRecording && !publishedDataset && (
                  <p className="text-center text-accent font-bold mt-4">
                    RECORDING COMPLETE! Download or publish to marketplace below.
                  </p>
                )}

                {publishedDataset && (
                  <div className="text-center mt-4 space-y-4">
                    <CheckCircle className="w-16 h-16 text-accent mx-auto mb-2" />
                    <div>
                      <p className="text-accent font-bold text-xl mb-3">
                        ✓ PUBLISHED TO MARKETPLACE!
                      </p>
                    </div>
                    
                    <div className="bg-background/50 border border-accent/30 rounded-lg p-4 space-y-6">
                      {/* Walrus Blob */}
                      <div className="border border-secondary/30 rounded p-3 bg-background/30">
                        <dt className="text-muted-foreground font-semibold mb-2">Walrus Encrypted Blob</dt>
                        <dd className="text-foreground break-all font-mono text-xs mb-3 p-2 bg-background rounded">{publishedDataset.blobId}</dd>
                        <a
                          href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${publishedDataset.blobId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary hover:text-secondary/80 underline font-semibold"
                        >
                          View Encrypted Blob on Walrus →
                        </a>
                      </div>
                      
                      {/* Sui Object */}
                      <div className="border border-accent/30 rounded p-3 bg-background/30">
                        <dt className="text-muted-foreground font-semibold mb-2">Sui Blockchain Object</dt>
                        <dd className="text-foreground break-all font-mono text-xs mb-3 p-2 bg-background rounded">{publishedDataset.datasetId}</dd>
                        <a
                          href={`https://suiscan.xyz/testnet/object/${publishedDataset.datasetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent/80 underline font-semibold"
                        >
                          View on Suiscan Explorer →
                        </a>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Your dataset is now live on the blockchain and available for purchase!
                      </p>
                    </div>
                  </div>
                )}
              </Card>

              {/* Upload to Marketplace */}
              {recordedBlob && !isRecording && !publishedDataset && (
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