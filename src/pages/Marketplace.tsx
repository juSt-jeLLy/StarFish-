import { useState, useEffect } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Database, Languages, ShoppingCart, Loader2, Filter, Clock, X } from "lucide-react";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";

const PACKAGE_ID = "0xf86206244bb9118fadcc036033c49332c53cd8d8c78dffcdd50518c2fe98ba99";
const REGISTRY_ID = "0x41286eecd6dc445a5a0e7b83d59eac3a408128b56aabeff5dbc53cbe51863fde"; // Replace after deployment
const BASE_PRICE_PER_DAY = 1_000_000; // 0.001 SUI in MIST

interface DatasetData {
  id: string;
  creator: string;
  language: string;
  dialect: string;
  durationLabel: string;
  durationSeconds: number;
  blobId: string;
  createdAt: number;
}

interface LanguageData {
  name: string;
  dialects: string[];
}

const dayOptions = [
  { days: 1, label: "1 Day" },
  { days: 7, label: "7 Days" },
  { days: 30, label: "30 Days" },
  { days: 90, label: "90 Days" },
  { days: 365, label: "1 Year" },
];

const Marketplace = () => {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [datasets, setDatasets] = useState<DatasetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedDialect, setSelectedDialect] = useState<string>("");
  const [myDatasets, setMyDatasets] = useState<Set<string>>(new Set());
  const [mySubscriptions, setMySubscriptions] = useState<Set<string>>(new Set());
  const [selectedDataset, setSelectedDataset] = useState<DatasetData | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageData[]>([]);

  useEffect(() => {
    loadMarketplace();
    const interval = setInterval(loadMarketplace, 10000);
    return () => clearInterval(interval);
  }, [currentAccount?.address]);

  const calculatePrice = (durationSeconds: number, days: number): number => {
    const durationMultiplier = durationSeconds / 30;
    return BASE_PRICE_PER_DAY * durationMultiplier * days;
  };

  const formatPrice = (mist: number): string => {
    return (mist / 1_000_000_000).toFixed(4);
  };

  const loadMarketplace = async () => {
    try {
      // Load all datasets from events
      const allObjects = await suiClient.queryEvents({
        query: {
          MoveEventType: `${PACKAGE_ID}::voice_marketplace::DatasetCreated`,
        },
        limit: 1000,
      });

      const datasetsData: DatasetData[] = await Promise.all(
        allObjects.data.map(async (event: any) => {
          const datasetId = event.parsedJson.dataset_id;
          
          try {
            const dataset = await suiClient.getObject({
              id: datasetId,
              options: { showContent: true, showOwner: true },
            });

            const fields = (dataset.data?.content as any)?.fields;
            if (!fields) return null;

            return {
              id: datasetId,
              creator: fields.creator,
              language: fields.language,
              dialect: fields.dialect,
              durationLabel: fields.duration_label,
              durationSeconds: parseInt(fields.duration_seconds),
              blobId: fields.blob_id,
              createdAt: parseInt(fields.created_at),
            };
          } catch (err) {
            console.error("Error loading dataset:", datasetId, err);
            return null;
          }
        })
      );

      const validDatasets = datasetsData.filter(Boolean) as DatasetData[];
      setDatasets(validDatasets);

      // Extract unique languages and their dialects
      const languageMap = new Map<string, Set<string>>();
      validDatasets.forEach(dataset => {
        if (!languageMap.has(dataset.language)) {
          languageMap.set(dataset.language, new Set());
        }
        languageMap.get(dataset.language)?.add(dataset.dialect);
      });

      const languages: LanguageData[] = Array.from(languageMap.entries()).map(([name, dialectSet]) => ({
        name,
        dialects: Array.from(dialectSet).sort(),
      }));
      setAvailableLanguages(languages.sort((a, b) => a.name.localeCompare(b.name)));

      // Load user's datasets and subscriptions
      if (currentAccount?.address) {
        const myDatasetIds = new Set(
          validDatasets
            .filter(d => d.creator === currentAccount.address)
            .map(d => d.id)
        );
        setMyDatasets(myDatasetIds);

        const subs = await suiClient.getOwnedObjects({
          owner: currentAccount.address,
          options: { showContent: true },
          filter: {
            StructType: `${PACKAGE_ID}::voice_marketplace::Subscription`,
          },
        });

        const subDatasetIds = new Set(
          subs.data
            .map(obj => (obj.data?.content as any)?.fields?.dataset_id)
            .filter(Boolean)
        );
        setMySubscriptions(subDatasetIds);
      }
    } catch (error) {
      console.error("Error loading marketplace:", error);
      toast.error("Failed to load marketplace");
    } finally {
      setLoading(false);
    }
  };

  const openPurchaseModal = (dataset: DatasetData) => {
    setSelectedDataset(dataset);
    setSelectedDays(7);
    setShowPurchaseModal(true);
  };

  const closePurchaseModal = () => {
    setShowPurchaseModal(false);
    setSelectedDataset(null);
    setSelectedDays(7);
  };

  const handlePurchase = async () => {
    if (!currentAccount?.address || !selectedDataset) {
      toast.error("Please connect your wallet");
      return;
    }

    if (selectedDataset.creator === currentAccount.address) {
      toast.error("You cannot purchase your own dataset");
      closePurchaseModal();
      return;
    }

    if (mySubscriptions.has(selectedDataset.id)) {
      toast.info("You already own this dataset");
      closePurchaseModal();
      return;
    }

    const price = calculatePrice(selectedDataset.durationSeconds, selectedDays);

    setPurchasing(selectedDataset.id);

    try {
      const tx = new Transaction();
      tx.setGasBudget(10000000);

      const [paymentCoin] = tx.splitCoins(tx.gas, [price]);

      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::subscribe_entry`,
        arguments: [
          paymentCoin,
          tx.object(selectedDataset.id),
          tx.pure.u64(selectedDays),
          tx.object('0x6'),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            console.log("Purchase successful:", result.digest);
            toast.success(`Subscription purchased for ${selectedDays} day(s)!`);
            closePurchaseModal();
            loadMarketplace();
          },
          onError: (error) => {
            console.error("Purchase error:", error);
            toast.error("Purchase failed: " + (error?.message || 'Unknown error'));
          },
        }
      );
    } catch (error: any) {
      console.error("Purchase error:", error);
      toast.error(`Purchase failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setPurchasing(null);
    }
  };

  // Filter datasets by selected language and dialect
  const filteredDatasets = datasets.filter(d => {
    if (selectedLanguage && d.language !== selectedLanguage) return false;
    if (selectedDialect && d.dialect !== selectedDialect) return false;
    return true;
  });

  const getButtonState = (dataset: DatasetData) => {
    if (myDatasets.has(dataset.id)) {
      return { text: "YOUR DATASET", disabled: true, variant: "outline" as const };
    }
    if (mySubscriptions.has(dataset.id)) {
      return { text: "OWNED", disabled: true, variant: "outline" as const };
    }
    return { 
      text: "PURCHASE", 
      disabled: false, 
      variant: "default" as const 
    };
  };

  // Get dialects for selected language
  const availableDialects = selectedLanguage 
    ? availableLanguages.find(l => l.name === selectedLanguage)?.dialects || []
    : [];

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
          <h1 className="text-4xl md:text-6xl font-bold text-center mb-8 neon-text glitch">
            VOICE MARKETPLACE
          </h1>

          {/* Advanced Filters */}
          <Card className="p-6 neon-border bg-card/80 backdrop-blur mb-8">
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Filter className="w-6 h-6 text-primary" />
                <span className="text-lg font-bold text-primary">Filter by Language:</span>
                <Button
                  variant={selectedLanguage === "" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedLanguage("");
                    setSelectedDialect("");
                  }}
                  className="pixel-border"
                >
                  All Languages
                </Button>
                {availableLanguages.map(lang => (
                  <Button
                    key={lang.name}
                    variant={selectedLanguage === lang.name ? "default" : "outline"}
                    onClick={() => {
                      setSelectedLanguage(lang.name);
                      setSelectedDialect("");
                    }}
                    className="pixel-border"
                  >
                    {lang.name}
                    <span className="ml-2 text-xs opacity-70">({lang.dialects.length})</span>
                  </Button>
                ))}
              </div>

              {/* Dialect Filter - shows when language is selected */}
              {selectedLanguage && availableDialects.length > 0 && (
                <div className="flex items-center gap-4 flex-wrap animate-slide-in border-t border-primary/20 pt-4">
                  <Languages className="w-6 h-6 text-secondary" />
                  <span className="text-lg font-bold text-secondary">Filter by Dialect:</span>
                  <Button
                    variant={selectedDialect === "" ? "default" : "outline"}
                    onClick={() => setSelectedDialect("")}
                    className="pixel-border"
                    size="sm"
                  >
                    All Dialects
                  </Button>
                  {availableDialects.map(dialect => (
                    <Button
                      key={dialect}
                      variant={selectedDialect === dialect ? "default" : "outline"}
                      onClick={() => setSelectedDialect(dialect)}
                      className="pixel-border"
                      size="sm"
                    >
                      {dialect}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Active Filters Display */}
            {(selectedLanguage || selectedDialect) && (
              <div className="mt-4 pt-4 border-t border-primary/20">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Active filters:</span>
                  {selectedLanguage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedLanguage("");
                        setSelectedDialect("");
                      }}
                      className="h-7 text-xs"
                    >
                      {selectedLanguage}
                      <X className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                  {selectedDialect && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedDialect("")}
                      className="h-7 text-xs"
                    >
                      {selectedDialect}
                      <X className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
          ) : filteredDatasets.length === 0 ? (
            <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
              <Database className="w-16 h-16 text-secondary mx-auto mb-4" />
              <p className="text-xl text-primary mb-2">No Datasets Available</p>
              <p className="text-muted-foreground">
                {selectedLanguage || selectedDialect
                  ? `No datasets found for the selected filters`
                  : "Be the first to record and publish a voice dataset!"}
              </p>
              {(selectedLanguage || selectedDialect) && (
                <Button
                  onClick={() => {
                    setSelectedLanguage("");
                    setSelectedDialect("");
                  }}
                  className="mt-4 bg-primary hover:bg-primary/90"
                >
                  Clear Filters
                </Button>
              )}
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDatasets.map((dataset) => {
                  const buttonState = getButtonState(dataset);
                  
                  return (
                    <Card
                      key={dataset.id}
                      className="p-6 neon-border bg-card/80 backdrop-blur hover-lift"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-primary mb-2">
                            {dataset.language} - {dataset.dialect}
                          </h3>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p>Duration: {dataset.durationLabel}</p>
                            <p>Created: {new Date(dataset.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <Languages className="w-8 h-8 text-secondary" />
                      </div>

                      <div className="space-y-3 mb-4 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-foreground/70">Format:</span>
                          <span className="text-primary font-bold">MP3 Encrypted</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-foreground/70">Storage:</span>
                          <span className="text-primary font-bold">Walrus</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-foreground/70">Price/Day:</span>
                          <span className="text-accent font-bold">
                            {formatPrice(calculatePrice(dataset.durationSeconds, 1))} SUI
                          </span>
                        </div>
                      </div>

                      <Button
                        onClick={() => openPurchaseModal(dataset)}
                        disabled={buttonState.disabled}
                        variant={buttonState.variant}
                        className={`w-full font-bold py-3 pixel-border ${
                          buttonState.disabled 
                            ? "opacity-50" 
                            : "bg-gradient-to-r from-primary to-secondary text-background hover:opacity-90"
                        }`}
                      >
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        {buttonState.text}
                      </Button>
                    </Card>
                  );
                })}
              </div>

              <div className="flex justify-center gap-4 mt-8">
                <div className="text-center text-muted-foreground">
                  <p className="text-sm">
                    Showing {filteredDatasets.length} of {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Purchase Modal */}
      {showPurchaseModal && selectedDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="p-6 neon-border bg-card/90 backdrop-blur max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-primary">Purchase Subscription</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={closePurchaseModal}
                className="h-8 w-8 p-0 hover:bg-secondary/20"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-6 mb-6">
              {/* Dataset Info */}
              <div className="bg-secondary/20 p-4 rounded-lg border border-primary/20">
                <h4 className="font-bold text-primary text-lg mb-1">
                  {selectedDataset.language} - {selectedDataset.dialect}
                </h4>
                <p className="text-sm text-muted-foreground">Duration: {selectedDataset.durationLabel}</p>
              </div>

              {/* Duration Selection */}
              <div>
                <label className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Select Subscription Duration:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {dayOptions.map(option => (
                    <Button
                      key={option.days}
                      variant={selectedDays === option.days ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedDays(option.days)}
                      className="text-xs py-3 h-auto font-medium transition-all duration-200"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Price Display */}
              <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1 text-center">Total Price</p>
                <p className="text-2xl font-bold text-accent text-center mb-2">
                  {formatPrice(calculatePrice(selectedDataset.durationSeconds, selectedDays))} SUI
                </p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{selectedDays} day(s)</span>
                  <span>×</span>
                  <span>{formatPrice(calculatePrice(selectedDataset.durationSeconds, 1))} SUI/day</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={closePurchaseModal}
                className="flex-1 py-3 font-medium"
                disabled={purchasing === selectedDataset.id}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePurchase}
                disabled={purchasing === selectedDataset.id}
                className="flex-1 py-3 font-bold bg-gradient-to-r from-primary to-secondary text-background hover:opacity-90 transition-opacity"
              >
                {purchasing === selectedDataset.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Confirm Purchase
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Marketplace;