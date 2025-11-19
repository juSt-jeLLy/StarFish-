import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mic, Square, Languages, Clock, Download, CheckCircle, Loader2, Plus, Settings } from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { WalrusEncryptUpload } from "@/components/WalrusEncryptUpload";
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from '@mysten/sui/transactions';
import { AudioRecorder, downloadAudio } from "@/utils/audioRecorder";
import { toast } from "sonner";
import spaceBg from "@/assets/space-bg.jpg";

const PACKAGE_ID = "0xf86206244bb9118fadcc036033c49332c53cd8d8c78dffcdd50518c2fe98ba99";
const REGISTRY_ID = "0x41286eecd6dc445a5a0e7b83d59eac3a408128b56aabeff5dbc53cbe51863fde"; // Replace after deployment

interface LanguageData {
  name: string;
  dialects: { name: string; description: string }[];
  sampleTexts: string[];
}

interface DurationData {
  id: string;
  label: string;
  seconds: number;
}

interface DatasetInfo {
  blobId: string;
  datasetId: string;
  txDigest: string;
}

const Record = () => {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  
  // Category Management State
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [showAddDialect, setShowAddDialect] = useState(false);
  const [showAddDuration, setShowAddDuration] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Language form
  const [languageName, setLanguageName] = useState("");
  const [sampleTexts, setSampleTexts] = useState("");
  
  // Dialect form
  const [dialectLanguage, setDialectLanguage] = useState("");
  const [dialectName, setDialectName] = useState("");
  const [dialectDescription, setDialectDescription] = useState("");
  
  // Duration form
  const [durationLabel, setDurationLabel] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  
  // Data State
  const [languages, setLanguages] = useState<LanguageData[]>([]);
  const [durations, setDurations] = useState<DurationData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Recording State
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageData | null>(null);
  const [selectedDialect, setSelectedDialect] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<DurationData | null>(null);
  const [currentText, setCurrentText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState<AudioRecorder | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [visualizerData, setVisualizerData] = useState<Uint8Array | null>(null);
  const [publishedDataset, setPublishedDataset] = useState<DatasetInfo | null>(null);

  useEffect(() => {
    loadCategoriesAndDurations();
  }, []);

  const loadCategoriesAndDurations = async () => {
    setLoading(true);
    try {
      // Load registry
      const registry = await suiClient.getObject({
        id: REGISTRY_ID,
        options: { showContent: true },
      });

      const fields = (registry.data?.content as any)?.fields;
      if (fields?.languages?.fields?.contents) {
        const languagesMap = fields.languages.fields.contents;
        const loadedLanguages: LanguageData[] = [];
        
        for (const entry of languagesMap) {
          const langName = entry.fields.key;
          const langData = entry.fields.value.fields;
          
          const dialects = langData.dialects.map((d: any) => ({
            name: d.fields.name,
            description: d.fields.description || "",
          }));
          
          loadedLanguages.push({
            name: langName,
            dialects,
            sampleTexts: langData.sample_texts || [],
          });
        }
        
        setLanguages(loadedLanguages);
      }

      // Load duration options
      const durationsResult = await suiClient.queryEvents({
        query: {
          MoveEventType: `${PACKAGE_ID}::voice_marketplace::DurationOptionCreated`,
        },
        limit: 1000,
      });

      const loadedDurations: DurationData[] = await Promise.all(
        durationsResult.data.map(async (event: any) => {
          const durationId = event.parsedJson.duration_id;
          try {
            const durationObj = await suiClient.getObject({
              id: durationId,
              options: { showContent: true },
            });
            const fields = (durationObj.data?.content as any)?.fields;
            if (!fields) return null;
            return {
              id: durationId,
              label: fields.label,
              seconds: parseInt(fields.seconds),
            };
          } catch {
            return null;
          }
        })
      );

      setDurations(loadedDurations.filter(Boolean) as DurationData[]);
    } catch (error) {
      console.error("Error loading categories:", error);
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  // Category Management Functions
  const handleAddLanguage = async () => {
    if (!currentAccount?.address || !languageName.trim() || !sampleTexts.trim()) {
      toast.error("Please fill all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const tx = new Transaction();
      tx.setGasBudget(10000000);
      
      const textsArray = sampleTexts
        .split('\n')
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::add_language_entry`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.pure.string(languageName.trim()),
          tx.pure.vector('string', textsArray),
          tx.object('0x6'),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            toast.success(`Language "${languageName}" added successfully!`);
            setLanguageName("");
            setSampleTexts("");
            setShowAddLanguage(false);
            loadCategoriesAndDurations();
          },
          onError: (error: any) => {
            toast.error("Failed to add language: " + (error?.message || 'Unknown error'));
          },
        }
      );
    } catch (error: any) {
      toast.error(`Failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDialect = async () => {
    if (!currentAccount?.address || !dialectLanguage.trim() || !dialectName.trim()) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const tx = new Transaction();
      tx.setGasBudget(10000000);
      
      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::add_dialect_entry`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.pure.string(dialectLanguage.trim()),
          tx.pure.string(dialectName.trim()),
          tx.pure.string(dialectDescription.trim() || ""),
          tx.object('0x6'),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            toast.success(`Dialect "${dialectName}" added to ${dialectLanguage}!`);
            setDialectLanguage("");
            setDialectName("");
            setDialectDescription("");
            setShowAddDialect(false);
            loadCategoriesAndDurations();
          },
          onError: (error: any) => {
            toast.error("Failed to add dialect: " + (error?.message || 'Unknown error'));
          },
        }
      );
    } catch (error: any) {
      toast.error(`Failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDuration = async () => {
    if (!currentAccount?.address || !durationLabel.trim() || !durationSeconds.trim()) {
      toast.error("Please fill all fields");
      return;
    }

    const seconds = parseInt(durationSeconds);
    if (isNaN(seconds) || seconds <= 0) {
      toast.error("Please enter a valid number of seconds");
      return;
    }

    setIsSubmitting(true);
    try {
      const tx = new Transaction();
      tx.setGasBudget(10000000);
      
      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::create_duration_option_entry`,
        arguments: [
          tx.pure.string(durationLabel.trim()),
          tx.pure.u64(seconds),
          tx.object('0x6'),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            toast.success(`Duration option "${durationLabel}" created!`);
            setDurationLabel("");
            setDurationSeconds("");
            setShowAddDuration(false);
            loadCategoriesAndDurations();
          },
          onError: (error: any) => {
            toast.error("Failed to create duration: " + (error?.message || 'Unknown error'));
          },
        }
      );
    } catch (error: any) {
      toast.error(`Failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recording Functions
  const handleLanguageSelect = (language: LanguageData) => {
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

  const handleDurationSelect = (duration: DurationData) => {
    setSelectedDuration(duration);
    if (selectedLanguage && selectedLanguage.sampleTexts.length > 0) {
      const randomText = selectedLanguage.sampleTexts[
        Math.floor(Math.random() * selectedLanguage.sampleTexts.length)
      ];
      setCurrentText(randomText);
    }
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
    if (recordedBlob && selectedLanguage && selectedDialect) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `voice-${selectedLanguage.name}-${selectedDialect}-${timestamp}.webm`;
      downloadAudio(recordedBlob, filename);
      toast.success("Download started!");
    }
  };

  const handlePublishSuccess = (datasetInfo: DatasetInfo) => {
    setPublishedDataset(datasetInfo);
    toast.success("Dataset published to marketplace!");
  };

  const handleNewRecording = () => {
    setSelectedDuration(null);
    setCurrentText("");
    setRecordedBlob(null);
    setPublishedDataset(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

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
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl md:text-6xl font-bold neon-text glitch">
              RECORD YOUR VOICE
            </h1>
            <Button
              onClick={() => setShowCategoryManagement(!showCategoryManagement)}
              className="bg-gradient-to-r from-primary to-secondary text-background font-bold pixel-border"
            >
              <Settings className="w-5 h-5 mr-2" />
              {showCategoryManagement ? "Hide" : "Manage"} Categories
            </Button>
          </div>

          {/* Category Management Section */}
          {showCategoryManagement && (
            <div className="mb-8 space-y-4 animate-slide-in">
              <Card className="p-6 neon-border bg-card/80 backdrop-blur">
                <h3 className="text-2xl font-bold text-primary mb-4">Category Management</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Add new languages, dialects, and duration options to expand the marketplace
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button
                    onClick={() => {
                      setShowAddLanguage(!showAddLanguage);
                      setShowAddDialect(false);
                      setShowAddDuration(false);
                    }}
                    className="bg-primary hover:bg-primary/90 font-bold"
                  >
                    <Languages className="w-5 h-5 mr-2" />
                    Add Language
                  </Button>
                  
                  <Button
                    onClick={() => {
                      setShowAddDialect(!showAddDialect);
                      setShowAddLanguage(false);
                      setShowAddDuration(false);
                    }}
                    className="bg-secondary hover:bg-secondary/90 font-bold"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Dialect
                  </Button>
                  
                  <Button
                    onClick={() => {
                      setShowAddDuration(!showAddDuration);
                      setShowAddLanguage(false);
                      setShowAddDialect(false);
                    }}
                    className="bg-accent hover:bg-accent/90 font-bold"
                  >
                    <Clock className="w-5 h-5 mr-2" />
                    Add Duration
                  </Button>
                </div>
              </Card>

              {/* Add Language Form */}
              {showAddLanguage && (
                <Card className="p-6 neon-border bg-card/80 backdrop-blur animate-slide-in">
                  <h4 className="text-xl font-bold text-primary mb-4">Add New Language</h4>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="language-name" className="text-foreground font-semibold">Language Name</Label>
                      <Input
                        id="language-name"
                        value={languageName}
                        onChange={(e) => setLanguageName(e.target.value)}
                        placeholder="e.g., English, Spanish, Mandarin"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="sample-texts" className="text-foreground font-semibold">Sample Texts (one per line)</Label>
                      <Textarea
                        id="sample-texts"
                        value={sampleTexts}
                        onChange={(e) => setSampleTexts(e.target.value)}
                        placeholder="Enter sample texts, one per line..."
                        rows={6}
                        className="mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Add at least 3 sample texts for speakers to read
                      </p>
                    </div>
                    
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setShowAddLanguage(false)}
                        variant="outline"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddLanguage}
                        disabled={isSubmitting}
                        className="bg-primary hover:bg-primary/90"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          'Add Language'
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Add Dialect Form */}
              {showAddDialect && (
                <Card className="p-6 neon-border bg-card/80 backdrop-blur animate-slide-in">
                  <h4 className="text-xl font-bold text-secondary mb-4">Add New Dialect</h4>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="dialect-language" className="text-foreground font-semibold">Language</Label>
                      <Input
                        id="dialect-language"
                        value={dialectLanguage}
                        onChange={(e) => setDialectLanguage(e.target.value)}
                        placeholder="e.g., English"
                        className="mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Must match an existing language name exactly
                      </p>
                    </div>
                    
                    <div>
                      <Label htmlFor="dialect-name" className="text-foreground font-semibold">Dialect Name</Label>
                      <Input
                        id="dialect-name"
                        value={dialectName}
                        onChange={(e) => setDialectName(e.target.value)}
                        placeholder="e.g., American, British"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="dialect-description" className="text-foreground font-semibold">Description (optional)</Label>
                      <Input
                        id="dialect-description"
                        value={dialectDescription}
                        onChange={(e) => setDialectDescription(e.target.value)}
                        placeholder="Brief description of this dialect"
                        className="mt-2"
                      />
                    </div>
                    
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setShowAddDialect(false)}
                        variant="outline"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddDialect}
                        disabled={isSubmitting}
                        className="bg-secondary hover:bg-secondary/90"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          'Add Dialect'
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Add Duration Form */}
              {showAddDuration && (
                <Card className="p-6 neon-border bg-card/80 backdrop-blur animate-slide-in">
                  <h4 className="text-xl font-bold text-accent mb-4">Add New Duration Option</h4>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="duration-label" className="text-foreground font-semibold">Duration Label</Label>
                      <Input
                        id="duration-label"
                        value={durationLabel}
                        onChange={(e) => setDurationLabel(e.target.value)}
                        placeholder="e.g., 30 seconds, 1 minute, 5 minutes"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="duration-seconds" className="text-foreground font-semibold">Duration in Seconds</Label>
                      <Input
                        id="duration-seconds"
                        type="number"
                        value={durationSeconds}
                        onChange={(e) => setDurationSeconds(e.target.value)}
                        placeholder="e.g., 30, 60, 300"
                        className="mt-2"
                      />
                    </div>
                    
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setShowAddDuration(false)}
                        variant="outline"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddDuration}
                        disabled={isSubmitting}
                        className="bg-accent hover:bg-accent/90"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create Duration'
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Language Selection */}
          {!selectedLanguage && (
            <div className="mb-12 animate-slide-in">
              <h2 className="text-2xl font-bold mb-6 text-primary flex items-center justify-center gap-2">
                <Languages className="w-8 h-8" />
                SELECT LANGUAGE
              </h2>
              {languages.length === 0 ? (
                <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
                  <p className="text-muted-foreground mb-4">
                    No languages available. Add one using Category Management.
                  </p>
                  <Button
                    onClick={() => {
                      setShowCategoryManagement(true);
                      setShowAddLanguage(true);
                    }}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add First Language
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {languages.map((lang) => (
                    <Card
                      key={lang.name}
                      className="p-6 cursor-pointer neon-border bg-card/50 backdrop-blur hover-lift text-center"
                      onClick={() => handleLanguageSelect(lang)}
                    >
                      <p className="text-xl font-bold text-primary">{lang.name}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {lang.dialects.length} dialect(s)
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dialect Selection */}
          {selectedLanguage && !selectedDialect && (
            <div className="mb-12 animate-slide-in">
              <Button
                variant="ghost"
                onClick={() => setSelectedLanguage(null)}
                className="mb-4 text-secondary hover:text-secondary/80"
              >
                ← BACK TO LANGUAGES
              </Button>
              <h2 className="text-2xl font-bold mb-6 text-primary flex items-center justify-center gap-2">
                SELECT DIALECT FOR {selectedLanguage.name.toUpperCase()}
              </h2>
              {selectedLanguage.dialects.length === 0 ? (
                <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
                  <p className="text-muted-foreground mb-4">
                    No dialects available for {selectedLanguage.name}. Add one using Category Management.
                  </p>
                  <Button
                    onClick={() => {
                      setShowCategoryManagement(true);
                      setShowAddDialect(true);
                      setDialectLanguage(selectedLanguage.name);
                      setSelectedLanguage(null);
                    }}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Dialect
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {selectedLanguage.dialects.map((dialect) => (
                    <Card
                      key={dialect.name}
                      className="p-6 cursor-pointer neon-border bg-card/50 backdrop-blur hover-lift text-center"
                      onClick={() => handleDialectSelect(dialect.name)}
                    >
                      <p className="text-xl font-bold text-secondary">{dialect.name}</p>
                      {dialect.description && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {dialect.description}
                        </p>
                      )}
                    </Card>
                  ))}
                </div>
              )}
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
              {durations.length === 0 ? (
                <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
                  <p className="text-muted-foreground mb-4">
                    No duration options available. Add one using Category Management.
                  </p>
                  <Button
                    onClick={() => {
                      setShowCategoryManagement(true);
                      setShowAddDuration(true);
                      setSelectedDialect("");
                    }}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Duration Option
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {durations.map((duration) => (
                    <Card
                      key={duration.id}
                      className="p-6 cursor-pointer neon-border bg-card/50 backdrop-blur hover-lift text-center"
                      onClick={() => handleDurationSelect(duration)}
                    >
                      <p className="text-xl font-bold text-accent">{duration.label}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {duration.seconds} seconds
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recording Interface */}
          {currentText && selectedDuration && (
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
                    {selectedLanguage?.name} - {selectedDialect} - {selectedDuration.label}
                  </p>
                  <h3 className="text-xl font-bold text-primary mb-4 text-center">READ THIS TEXT:</h3>
                  <div className="max-h-96 overflow-y-auto p-4 bg-background/50 border-2 border-primary/30 rounded">
                    <p className="text-base text-foreground leading-relaxed text-left">
                      {currentText}
                    </p>
                  </div>
                </div>

                <div className="h-48 mb-6 relative overflow-hidden neon-border bg-background/50 rounded">
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
              {recordedBlob && !isRecording && !publishedDataset && selectedLanguage && selectedDuration && (
                <WalrusEncryptUpload
                  audioBlob={recordedBlob}
                  language={selectedLanguage.name}
                  dialect={selectedDialect}
                  duration={selectedDuration.label}
                  durationId={selectedDuration.id}
                  registryId={REGISTRY_ID}
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