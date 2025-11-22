import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mic, Square, Languages, Clock, Download, CheckCircle, Loader2, Plus, X } from "lucide-react";
import Navigation from "@/components/Navigation";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { WalrusEncryptUpload } from "@/components/WalrusEncryptUpload";
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from '@mysten/sui/transactions';
import { AudioRecorder, downloadAudio } from "@/utils/audioRecorder";
import { toast } from "sonner";
import spaceBg from "@/assets/space-bg.jpg";
import { config } from '@/config/env';

const PACKAGE_ID = config.packageId;
const REGISTRY_ID = config.registryId;

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
  
  // Form state
  const [showAddLanguageForm, setShowAddLanguageForm] = useState(false);
  const [showAddDialectForm, setShowAddDialectForm] = useState(false);
  const [showAddDurationForm, setShowAddDurationForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Language form
  const [languageName, setLanguageName] = useState("");
  const [sampleTexts, setSampleTexts] = useState("");
  
  // Dialect form
  const [dialectName, setDialectName] = useState("");
  const [dialectDescription, setDialectDescription] = useState("");
  
  // Duration form
  const [durationLabel, setDurationLabel] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  
  // Data State
  const [languages, setLanguages] = useState<LanguageData[]>([]);
  const [durations, setDurations] = useState<DurationData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection State
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageData | null>(null);
  const [selectedDialect, setSelectedDialect] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<DurationData | null>(null);
  
  // Recording State
  const [currentText, setCurrentText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState<AudioRecorder | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [visualizerData, setVisualizerData] = useState<Uint8Array | null>(null);
  const [publishedDataset, setPublishedDataset] = useState<DatasetInfo | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadCategoriesAndDurations();
  }, []);

  const loadCategoriesAndDurations = async () => {
    setLoading(true);
    try {
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

  const handleAddLanguage = async () => {
    if (!currentAccount?.address || !languageName.trim() || !sampleTexts.trim()) {
      toast.error("Please fill all fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const tx = new Transaction();
      
      // Split by double newlines to treat paragraphs as separate texts
      const textsArray = sampleTexts
        .split(/\n\n+/)  // Split on 2 or more newlines (paragraph breaks)
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      if (textsArray.length === 0) {
        toast.error("Please add at least one sample text paragraph");
        setIsSubmitting(false);
        return;
      }
      
      // Dynamic gas calculation based on data size
      // Base gas: 10M MIST
      // Per paragraph: 5M MIST
      // Per character: 10K MIST (for storage costs)
      const totalTextLength = textsArray.reduce((sum, text) => sum + text.length, 0);
      const paragraphCount = textsArray.length;
      
      const baseGas = 10_000_000; // 10M MIST base
      const perParagraphGas = 5_000_000; // 5M per paragraph
      const perCharGas = 10_000; // 10K per character
      
      const estimatedGas = baseGas + 
                           (paragraphCount * perParagraphGas) + 
                           (totalTextLength * perCharGas);
      
      // Add 50% buffer for safety, cap at 500M MIST (0.5 SUI)
      const finalGas = Math.min(Math.ceil(estimatedGas * 1.5), 500_000_000);
      
      tx.setGasBudget(finalGas);
      
      console.log(`Gas calculation:
        - Paragraphs: ${paragraphCount}
        - Total characters: ${totalTextLength}
        - Base gas: ${baseGas / 1_000_000}M MIST
        - Paragraph gas: ${(paragraphCount * perParagraphGas) / 1_000_000}M MIST
        - Character gas: ${(totalTextLength * perCharGas) / 1_000_000}M MIST
        - Final budget (with 50% buffer): ${finalGas / 1_000_000}M MIST (${finalGas / 1_000_000_000} SUI)
      `);
      
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
            toast.success(`Language "${languageName}" added with ${textsArray.length} sample text(s)!`);
            setLanguageName("");
            setSampleTexts("");
            setShowAddLanguageForm(false);
            loadCategoriesAndDurations();
          },
          onError: (error: any) => {
            const errorMsg = error?.message || 'Unknown error';
            if (errorMsg.includes('ELanguageAlreadyExists') || errorMsg.includes('8')) {
              toast.error(`Language "${languageName}" already exists!`);
            } else if (errorMsg.includes('InsufficientGas')) {
              toast.error("Insufficient gas. Try reducing the amount of sample text or breaking it into smaller pieces.");
            } else if (errorMsg.includes('InsufficientCoinBalance')) {
              toast.error(`Insufficient SUI balance. You need at least ${(finalGas / 1_000_000_000).toFixed(3)} SUI for this transaction.`);
            } else {
              toast.error("Failed to add language: " + errorMsg);
            }
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
    if (!currentAccount?.address || !selectedLanguage || !dialectName.trim()) {
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
          tx.pure.string(selectedLanguage.name),
          tx.pure.string(dialectName.trim()),
          tx.pure.string(dialectDescription.trim() || ""),
          tx.object('0x6'),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            toast.success(`Dialect "${dialectName}" added to ${selectedLanguage.name}!`);
            setDialectName("");
            setDialectDescription("");
            setShowAddDialectForm(false);
            loadCategoriesAndDurations();
            // Refresh selected language
            const updatedLang = languages.find(l => l.name === selectedLanguage.name);
            if (updatedLang) setSelectedLanguage(updatedLang);
          },
          onError: (error: any) => {
            const errorMsg = error?.message || 'Unknown error';
            if (errorMsg.includes('EDialectAlreadyExists') || errorMsg.includes('9')) {
              toast.error(`Dialect "${dialectName}" already exists for ${selectedLanguage.name}!`);
            } else {
              toast.error("Failed to add dialect: " + errorMsg);
            }
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
          tx.object(REGISTRY_ID),
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
            setShowAddDurationForm(false);
            loadCategoriesAndDurations();
          },
          onError: (error: any) => {
            const errorMsg = error?.message || 'Unknown error';
            if (errorMsg.includes('EDurationAlreadyExists') || errorMsg.includes('10')) {
              toast.error(`Duration "${durationLabel}" already exists!`);
            } else {
              toast.error("Failed to create duration: " + errorMsg);
            }
          },
        }
      );
    } catch (error: any) {
      toast.error(`Failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLanguageSelect = (language: LanguageData) => {
    setSelectedLanguage(language);
    setSelectedDialect("");
    setSelectedDuration(null);
    setCurrentText("");
    setRecordedBlob(null);
    setPublishedDataset(null);
  };

  const handleDialectSelect = (dialect: string) => {
    setSelectedDialect(dialect);
    setSelectedDuration(null);
    setCurrentText("");
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
        if (recordingInterval) {
          clearInterval(recordingInterval);
          setRecordingInterval(null);
        }
        
        const blob = await audioRecorder.stop();
        
        // Validate recording duration
        if (selectedDuration) {
          const targetSeconds = selectedDuration.seconds;
          const minSeconds = targetSeconds - 5; // 5 seconds tolerance below
          const maxSeconds = targetSeconds + 5; // 5 seconds tolerance above
          
          if (recordingTime < minSeconds) {
            toast.error(`Recording too short! Please record for at least ${minSeconds} seconds (target: ${targetSeconds}s)`);
            setRecordingTime(0);
            return;
          }
          
          if (recordingTime > maxSeconds) {
            toast.error(`Recording too long! Please keep it under ${maxSeconds} seconds (target: ${targetSeconds}s)`);
            setRecordingTime(0);
            return;
          }
        }
        
        setRecordedBlob(blob);
        setVisualizerData(null);
        toast.success(`Recording saved successfully! Duration: ${recordingTime}s`);
        setRecordingTime(0);
      } catch (error) {
        console.error("Error stopping recording:", error);
        toast.error("Failed to save recording");
        setRecordingTime(0);
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
        setRecordingTime(0);
        
        // Start timer
        const interval = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
        setRecordingInterval(interval);
        
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

  const resetToLanguages = () => {
    setSelectedLanguage(null);
    setSelectedDialect("");
    setSelectedDuration(null);
    setCurrentText("");
    setRecordedBlob(null);
    setPublishedDataset(null);
  };

  if (loading) {
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
            <h1 className="text-4xl md:text-6xl font-bold neon-text glitch text-center mb-12">
              RECORD YOUR VOICE
            </h1>
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
          </div>
        </div>
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
          <h1 className="text-4xl md:text-6xl font-bold neon-text glitch text-center mb-12">
            RECORD YOUR VOICE
          </h1>

          {/* Breadcrumb Navigation */}
          {(selectedLanguage || selectedDialect || selectedDuration) && (
            <div className="mb-8 flex items-center gap-2 text-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToLanguages}
                className="text-primary hover:text-primary/80"
              >
                Languages
              </Button>
              {selectedLanguage && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedDialect("");
                      setSelectedDuration(null);
                      setCurrentText("");
                      setRecordedBlob(null);
                      setPublishedDataset(null);
                    }}
                    className="text-secondary hover:text-secondary/80"
                  >
                    {selectedLanguage.name}
                  </Button>
                </>
              )}
              {selectedDialect && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedDuration(null);
                      setCurrentText("");
                      setRecordedBlob(null);
                      setPublishedDataset(null);
                    }}
                    className="text-accent hover:text-accent/80"
                  >
                    {selectedDialect}
                  </Button>
                </>
              )}
              {selectedDuration && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-foreground font-semibold">{selectedDuration.label}</span>
                </>
              )}
            </div>
          )}

          {/* LEVEL 1: Language Selection */}
          {!selectedLanguage && (
            <div className="animate-slide-in space-y-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
                  <Languages className="w-8 h-8" />
                  SELECT LANGUAGE
                </h2>
                {!showAddLanguageForm && (
                  <Button
                    onClick={() => setShowAddLanguageForm(true)}
                    className="bg-primary hover:bg-primary/90 font-bold"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Language
                  </Button>
                )}
              </div>

              {/* Add Language Form */}
              {showAddLanguageForm && (
                <Card className="p-6 neon-border bg-card/80 backdrop-blur mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xl font-bold text-primary">Add New Language</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddLanguageForm(false);
                        setLanguageName("");
                        setSampleTexts("");
                      }}
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-foreground font-semibold">Language Name</Label>
                      <Input
                        value={languageName}
                        onChange={(e) => setLanguageName(e.target.value)}
                        placeholder="e.g., English, Spanish, Mandarin"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-foreground font-semibold">Sample Texts (separate paragraphs with blank lines)</Label>
                      <Textarea
                        value={sampleTexts}
                        onChange={(e) => setSampleTexts(e.target.value)}
                        placeholder="Enter first paragraph here...

Press Enter twice (blank line) to separate paragraphs.

Each paragraph will be a separate sample text for recording."
                        rows={12}
                        className="mt-2 font-mono text-sm"
                      />
                      <div className="flex justify-between items-start mt-2">
                        <p className="text-xs text-muted-foreground">
                          💡 <strong>Add at least 3 paragraphs</strong> - Separate each paragraph with a blank line (press Enter twice).
                        </p>
                        <p className="text-xs text-primary font-semibold whitespace-nowrap ml-2">
                          {sampleTexts.split(/\n\n+/).filter(t => t.trim().length > 0).length} paragraph(s)
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        ⚠️ <strong>Note:</strong> Longer texts require more gas. Each paragraph can be 1-3 sentences for optimal gas costs.
                      </p>
                    </div>
                    
                    <Button
                      onClick={handleAddLanguage}
                      disabled={isSubmitting}
                      className="bg-primary hover:bg-primary/90 w-full"
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
                </Card>
              )}

              {/* Language Grid */}
              {languages.length === 0 ? (
                <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
                  <p className="text-muted-foreground mb-4">
                    No languages available. Add your first language above.
                  </p>
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

          {/* LEVEL 2: Dialect Selection */}
          {selectedLanguage && !selectedDialect && (
            <div className="animate-slide-in space-y-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-secondary">
                  SELECT DIALECT FOR {selectedLanguage.name.toUpperCase()}
                </h2>
                {!showAddDialectForm && (
                  <Button
                    onClick={() => setShowAddDialectForm(true)}
                    className="bg-secondary hover:bg-secondary/90 font-bold"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Dialect
                  </Button>
                )}
              </div>

              {/* Add Dialect Form */}
              {showAddDialectForm && (
                <Card className="p-6 neon-border bg-card/80 backdrop-blur mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xl font-bold text-secondary">
                      Add Dialect to {selectedLanguage.name}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddDialectForm(false);
                        setDialectName("");
                        setDialectDescription("");
                      }}
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-foreground font-semibold">Dialect Name</Label>
                      <Input
                        value={dialectName}
                        onChange={(e) => setDialectName(e.target.value)}
                        placeholder="e.g., American, British, Australian"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-foreground font-semibold">Description (optional)</Label>
                      <Input
                        value={dialectDescription}
                        onChange={(e) => setDialectDescription(e.target.value)}
                        placeholder="Brief description of this dialect"
                        className="mt-2"
                      />
                    </div>
                    
                    <Button
                      onClick={handleAddDialect}
                      disabled={isSubmitting}
                      className="bg-secondary hover:bg-secondary/90 w-full"
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
                </Card>
              )}

              {/* Dialect Grid */}
              {selectedLanguage.dialects.length === 0 ? (
                <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
                  <p className="text-muted-foreground mb-4">
                    No dialects available for {selectedLanguage.name}. Add one above.
                  </p>
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

          {/* LEVEL 3: Duration Selection */}
          {selectedDialect && !selectedDuration && (
            <div className="animate-slide-in space-y-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-accent flex items-center gap-2">
                  <Clock className="w-8 h-8" />
                  SELECT DURATION
                </h2>
                {!showAddDurationForm && (
                  <Button
                    onClick={() => setShowAddDurationForm(true)}
                    className="bg-accent hover:bg-accent/90 font-bold"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Duration
                  </Button>
                )}
              </div>

              {/* Add Duration Form */}
              {showAddDurationForm && (
                <Card className="p-6 neon-border bg-card/80 backdrop-blur mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xl font-bold text-accent">
                      Add Duration for {selectedLanguage?.name} - {selectedDialect}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddDurationForm(false);
                        setDurationLabel("");
                        setDurationSeconds("");
                      }}
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-foreground font-semibold">Duration Label</Label>
                      <Input
                        value={durationLabel}
                        onChange={(e) => setDurationLabel(e.target.value)}
                        placeholder="e.g., 30 seconds, 1 minute, 5 minutes"
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-foreground font-semibold">Duration in Seconds</Label>
                      <Input
                        type="number"
                        value={durationSeconds}
                        onChange={(e) => setDurationSeconds(e.target.value)}
                        placeholder="e.g., 30, 60, 300"
                        className="mt-2"
                      />
                    </div>
                    
                    <Button
                      onClick={handleAddDuration}
                      disabled={isSubmitting}
                      className="bg-accent hover:bg-accent/90 w-full"
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
                </Card>
              )}

              {/* Duration Grid */}
              {durations.length === 0 ? (
                <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
                  <p className="text-muted-foreground mb-4">
                    No duration options available. Add one above.
                  </p>
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

          {/* LEVEL 4: Recording Interface */}
          {currentText && selectedDuration && (
            <div className="animate-slide-in space-y-6">
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
                  
                  {/* Recording Timer Overlay */}
                  {isRecording && selectedDuration && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-background/90 border-2 border-primary rounded-lg px-8 py-4">
                        <div className="text-center">
                          <p className="text-5xl font-bold text-primary font-mono">
                            {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            Target: {selectedDuration.seconds}s ({selectedDuration.seconds - 5}s - {selectedDuration.seconds + 5}s)
                          </p>
                          {recordingTime > selectedDuration.seconds + 5 && (
                            <p className="text-destructive font-bold text-sm mt-1 animate-pulse">
                              ⚠️ Too long! Stop recording
                            </p>
                          )}
                          {recordingTime < selectedDuration.seconds - 5 && (
                            <p className="text-accent font-bold text-sm mt-1">
                              Keep recording...
                            </p>
                          )}
                          {recordingTime >= selectedDuration.seconds - 5 && recordingTime <= selectedDuration.seconds + 5 && (
                            <p className="text-primary font-bold text-sm mt-1 animate-pulse">
                              ✓ Perfect duration!
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
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
                  <div className="text-center mt-4 space-y-2">
                    <p className="text-destructive font-bold animate-pulse">
                      RECORDING IN PROGRESS...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recording time: {recordingTime}s / Target: {selectedDuration?.seconds}s (±5s tolerance)
                    </p>
                  </div>
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
                          href={`https://walruscan.com/testnet/blob/${publishedDataset.blobId}`}
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