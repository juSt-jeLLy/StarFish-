import { useState, useEffect } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Database, Languages, ShoppingCart, Loader2, Filter } from "lucide-react";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";

const PACKAGE_ID = "0x59a6ee02e71ec4dc901f47b795aeea6bc5e0f424d9daeecddf645ef9b063afff";
const SUBSCRIPTION_FEE = 10_000_000; // 0.01 SUI in MIST

interface DatasetData {
  id: string;
  creator: string;
  language: string;
  dialect: string;
  duration: string;
  blobId: string;
  createdAt: number;
}

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

  useEffect(() => {
    loadMarketplace();
    const interval = setInterval(loadMarketplace, 5000);
    return () => clearInterval(interval);
  }, [currentAccount?.address]);

  const loadMarketplace = async () => {
    try {
      // Get all VoiceDataset objects from events
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
              duration: fields.duration,
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

      // Load user's own datasets and subscriptions
      if (currentAccount?.address) {
        const myDatasetIds = new Set(
          validDatasets
            .filter(d => d.creator === currentAccount.address)
            .map(d => d.id)
        );
        setMyDatasets(myDatasetIds);

        // Get user's subscriptions
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

    setPurchasing(dataset.id);

    try {
      // Get ALL user's SUI coins
      const coins = await suiClient.getCoins({
        owner: currentAccount.address,
        coinType: '0x2::sui::SUI',
      });

      if (coins.data.length === 0) {
        toast.error("No SUI coins found in wallet");
        setPurchasing(null);
        return;
      }

      // Check total balance
      const totalBalance = coins.data.reduce(
        (sum, coin) => sum + BigInt(coin.balance),
        BigInt(0)
      );

      // Need enough for subscription fee + estimated gas (0.02 SUI total)
      const requiredBalance = BigInt(SUBSCRIPTION_FEE) + BigInt(10_000_000);
      
      if (totalBalance < requiredBalance) {
        toast.error("Insufficient SUI balance (need at least 0.02 SUI for fee + gas)");
        setPurchasing(null);
        return;
      }

      const tx = new Transaction();
      tx.setGasBudget(10000000);

      // Split payment from gas coin (this is the recommended pattern)
      const [paymentCoin] = tx.splitCoins(tx.gas, [SUBSCRIPTION_FEE]);

      // Call subscribe_entry
      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::subscribe_entry`,
        arguments: [
          paymentCoin,             // Payment coin split from gas
          tx.object(dataset.id),   // VoiceDataset object
          tx.object('0x6'),        // Clock object
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: () => {
            toast.success("Purchase successful! Check 'My Subscriptions'");
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
    return { text: "PURCHASE (0.01 SUI)", disabled: false, variant: "default" as const };
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
          <h1 className="text-4xl md:text-6xl font-bold text-center mb-12 neon-text glitch">
            VOICE MARKETPLACE
          </h1>

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
                          <span className="text-foreground/70">License:</span>
                          <span className="text-primary font-bold">AI Training</span>
                        </div>
                      </div>

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