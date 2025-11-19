import { useState, useEffect } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Database, Languages, ShoppingCart, Loader2, Filter, Clock, Info } from "lucide-react";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";

const PACKAGE_ID = "0x12ec468fafe7aaf490550244e73f3565bf8d90fe1370223c267d4cd89b368040";
const BASE_PRICE_PER_DAY = 1_000_000; // 0.001 SUI in MIST

interface DatasetData {
  id: string;
  creator: string;
  language: string;
  dialect: string;
  duration: string;
  durationSeconds: number;
  blobId: string;
  createdAt: number;
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
  const [myDatasets, setMyDatasets] = useState<Set<string>>(new Set());
  const [mySubscriptions, setMySubscriptions] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    loadMarketplace();
    const interval = setInterval(loadMarketplace, 5000);
    return () => clearInterval(interval);
  }, [currentAccount?.address]);

  const calculatePrice = (durationSeconds: number, days: number): number => {
    const durationMultiplier = durationSeconds / 30;
    return BASE_PRICE_PER_DAY * durationMultiplier * days;
  };

  const formatPrice = (mist: number): string => {
    return (mist / 1_000_000_000).toFixed(4);
  };

  const parseDurationToSeconds = (duration: string): number => {
    if (duration === "30 seconds") return 30;
    if (duration === "1 minute") return 60;
    if (duration === "2 minutes") return 120;
    if (duration === "5 minutes") return 300;
    return 30;
  };

  const loadMarketplace = async () => {
    try {
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

            // Reconstruct duration string from seconds
            const durationSeconds = parseInt(fields.duration_seconds);
            let durationStr = "30 seconds";
            if (durationSeconds === 60) durationStr = "1 minute";
            else if (durationSeconds === 120) durationStr = "2 minutes";
            else if (durationSeconds === 300) durationStr = "5 minutes";

            return {
              id: datasetId,
              creator: fields.creator,
              language: fields.language,
              dialect: fields.dialect,
              duration: durationStr,
              durationSeconds,
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

      // Initialize default days (7 days) for each dataset
      const defaultDays: { [key: string]: number } = {};
      validDatasets.forEach(d => {
        if (!selectedDays[d.id]) {
          defaultDays[d.id] = 7;
        }
      });
      setSelectedDays(prev => ({ ...defaultDays, ...prev }));

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

  const handlePurchase = async (dataset: DatasetData) => {
    if (!currentAccount?.address) {
      toast.error("Please connect your wallet");
      return;
    }

    if (dataset.creator === currentAccount.address) {
      toast.error("You cannot purchase your own dataset");
      return;
    }

    if (mySubscriptions.has(dataset.id)) {
      toast.info("You already own this dataset");
      return;
    }

    const days = selectedDays[dataset.id] || 7;
    const price = calculatePrice(dataset.durationSeconds, days);

    setPurchasing(dataset.id);

    try {
      const tx = new Transaction();
      tx.setGasBudget(10000000);

      const [paymentCoin] = tx.splitCoins(tx.gas, [price]);

      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::subscribe_entry`,
        arguments: [
          paymentCoin,
          tx.object(dataset.id),
          tx.pure.u64(days),
          tx.object('0x6'),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            console.log("Purchase successful:", result.digest);
            toast.success(`Subscription purchased for ${days} day(s)!`);
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

  const filteredDatasets = selectedLanguage
    ? datasets.filter(d => d.language === selectedLanguage)
    : datasets;

  const languages = Array.from(new Set(datasets.map(d => d.language)));

  const getButtonState = (dataset: DatasetData) => {
    if (myDatasets.has(dataset.id)) {
      return { text: "YOUR DATASET", disabled: true, variant: "outline" as const };
    }
    if (mySubscriptions.has(dataset.id)) {
      return { text: "OWNED", disabled: true, variant: "outline" as const };
    }
    const days = selectedDays[dataset.id] || 7;
    const price = calculatePrice(dataset.durationSeconds, days);
    return { 
      text: `PURCHASE (${formatPrice(price)} SUI)`, 
      disabled: false, 
      variant: "default" as const 
    };
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
        <div className="container mx-auto max-w-7xl">
          <h1 className="text-4xl md:text-6xl font-bold text-center mb-8 neon-text glitch">
            VOICE MARKETPLACE
          </h1>

          {/* Pricing Info Banner */}
          <Card className="p-4 neon-border bg-card/80 backdrop-blur mb-8">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
              <div className="text-sm text-muted-foreground">
                <p className="font-bold text-primary mb-1">Dynamic Pricing:</p>
                <p>Base price: 0.001 SUI/day for 30 seconds</p>
                <p>• 1 minute = 0.002 SUI/day • 2 minutes = 0.004 SUI/day • 5 minutes = 0.01 SUI/day</p>
              </div>
            </div>
          </Card>

          {/* Language Filter */}
          <Card className="p-6 neon-border bg-card/80 backdrop-blur mb-8">
            <div className="flex items-center gap-4 flex-wrap">
              <Filter className="w-6 h-6 text-primary" />
              <span className="text-lg font-bold text-primary">Filter by Language:</span>
              <Button
                variant={selectedLanguage === "" ? "default" : "outline"}
                onClick={() => setSelectedLanguage("")}
                className="pixel-border"
              >
                All Languages
              </Button>
              {languages.map(lang => (
                <Button
                  key={lang}
                  variant={selectedLanguage === lang ? "default" : "outline"}
                  onClick={() => setSelectedLanguage(lang)}
                  className="pixel-border"
                >
                  {lang}
                </Button>
              ))}
            </div>
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
                {selectedLanguage 
                  ? `No datasets found for ${selectedLanguage}`
                  : "Be the first to record and publish a voice dataset!"}
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDatasets.map((dataset) => {
                  const buttonState = getButtonState(dataset);
                  const days = selectedDays[dataset.id] || 7;
                  const price = calculatePrice(dataset.durationSeconds, days);
                  const isOwned = myDatasets.has(dataset.id) || mySubscriptions.has(dataset.id);
                  
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
                            <p>Duration: {dataset.duration}</p>
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

                      {!isOwned && (
                        <div className="mb-4">
                          <label className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Subscription Duration:
                          </label>
                          <div className="grid grid-cols-5 gap-1 mt-2">
                            {dayOptions.map(option => (
                              <Button
                                key={option.days}
                                variant={selectedDays[dataset.id] === option.days ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedDays(prev => ({ ...prev, [dataset.id]: option.days }))}
                                className="text-xs py-1 h-auto"
                              >
                                {option.label}
                              </Button>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 text-center">
                            Total: <span className="text-accent font-bold">{formatPrice(price)} SUI</span> for {days} day(s)
                          </p>
                        </div>
                      )}

                      <Button
                        onClick={() => handlePurchase(dataset)}
                        disabled={buttonState.disabled || purchasing === dataset.id}
                        variant={buttonState.variant}
                        className={`w-full font-bold py-3 pixel-border ${
                          buttonState.disabled 
                            ? "opacity-50" 
                            : "bg-gradient-to-r from-primary to-secondary text-background hover:opacity-90"
                        }`}
                      >
                        {purchasing === dataset.id ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            PROCESSING...
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-5 h-5 mr-2" />
                            {buttonState.text}
                          </>
                        )}
                      </Button>
                    </Card>
                  );
                })}
              </div>

              <div className="flex justify-center gap-4 mt-8">
                <div className="text-center text-muted-foreground">
                  <p className="text-sm">
                    Showing {filteredDatasets.length} dataset{filteredDatasets.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Marketplace;