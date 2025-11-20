import { useState, useEffect } from "react";
import { useCurrentAccount, useSuiClient, useSignPersonalMessage } from "@mysten/dapp-kit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Download, Loader2, Clock, AlertCircle, Filter, X, Languages } from "lucide-react";
import { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex } from '@mysten/sui/utils';
import { toast } from "sonner";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";
import { config } from '@/config/env';

const PACKAGE_ID = config.packageId;
const SERVER_OBJECT_IDS = config.serverObjectIds;
const WALRUS_AGGREGATOR_URL = config.walrus.aggregatorUrl;

interface SubscriptionData {
  id: string;
  datasetId: string;
  createdAt: number;
  expiresAt: number;
  daysPurchased: number;
  language: string;
  dialect: string;
  durationLabel: string;
  durationSeconds: number;
  blobId: string;
  encryptionId: string;
  isExpired: boolean;
  timeRemaining: string;
  discountApplied: number;
}

interface LanguageData {
  name: string;
  dialects: string[];
}

const MySubscriptions = () => {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const { mutate: signPersonalMessage } = useSignPersonalMessage();
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedDialect, setSelectedDialect] = useState<string>("");
  const [showExpired, setShowExpired] = useState<boolean>(true);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageData[]>([]);

  const client = new SealClient({
    suiClient,
    serverConfigs: SERVER_OBJECT_IDS.map((id) => ({
      objectId: id,
      weight: 1,
    })),
    verifyKeyServers: false,
  });

  const getTimeRemaining = (expiresAt: number): string => {
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return "Expired";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const formatPrice = (mist: number): string => {
    return (mist / 1_000_000_000).toFixed(4);
  };

  useEffect(() => {
    if (currentAccount?.address) {
      loadSubscriptions();
      const interval = setInterval(loadSubscriptions, 30000);
      return () => clearInterval(interval);
    }
  }, [currentAccount?.address]);

  const loadSubscriptions = async () => {
    if (!currentAccount?.address) return;

    try {
      // Load single subscriptions only
      const singleSubs = await suiClient.getOwnedObjects({
        owner: currentAccount.address,
        options: { showContent: true, showType: true },
        filter: {
          StructType: `${PACKAGE_ID}::voice_marketplace::Subscription`,
        },
      });

      const subsData: SubscriptionData[] = await Promise.all(
        singleSubs.data.map(async (obj) => {
          const fields = (obj.data?.content as any)?.fields;
          if (!fields) return null;

          const dataset = await suiClient.getObject({
            id: fields.dataset_id,
            options: { showContent: true, showBcs: true },
          });

          const datasetFields = (dataset.data?.content as any)?.fields;
          if (!datasetFields) return null;

          let encryptionId = "";
          if (datasetFields.encryption_id) {
            const encryptionIdBytes = datasetFields.encryption_id;
            encryptionId = toHex(new Uint8Array(encryptionIdBytes));
          } else {
            return null;
          }

          const expiresAt = parseInt(fields.expires_at);
          const isExpired = Date.now() > expiresAt;

          return {
            id: fields.id.id,
            datasetId: fields.dataset_id,
            createdAt: parseInt(fields.created_at),
            expiresAt,
            daysPurchased: parseInt(fields.days_purchased),
            language: datasetFields.language,
            dialect: datasetFields.dialect,
            durationLabel: datasetFields.duration_label,
            durationSeconds: parseInt(datasetFields.duration_seconds),
            blobId: datasetFields.blob_id,
            encryptionId,
            isExpired,
            timeRemaining: getTimeRemaining(expiresAt),
            discountApplied: parseInt(fields.discount_applied || "0"),
          };
        })
      );

      const validSubs = subsData.filter(Boolean) as SubscriptionData[];
      validSubs.sort((a, b) => {
        if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1;
        return a.expiresAt - b.expiresAt;
      });
      setSubscriptions(validSubs);

      // Extract languages
      const languageMap = new Map<string, Set<string>>();
      validSubs.forEach(sub => {
        if (!languageMap.has(sub.language)) {
          languageMap.set(sub.language, new Set());
        }
        languageMap.get(sub.language)?.add(sub.dialect);
      });

      const languages: LanguageData[] = Array.from(languageMap.entries()).map(([name, dialectSet]) => ({
        name,
        dialects: Array.from(dialectSet).sort(),
      }));
      setAvailableLanguages(languages.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error("Error loading subscriptions:", error);
      toast.error("Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (sub: SubscriptionData) => {
    if (!currentAccount?.address) return;

    if (sub.isExpired) {
      toast.error("This subscription has expired. Please renew to download.");
      return;
    }

    setDownloading(sub.id);

    try {
      let currentSessionKey = sessionKey;
      
      if (!currentSessionKey || currentSessionKey.isExpired() || 
          currentSessionKey.getAddress() !== currentAccount.address) {
        const newSessionKey = await SessionKey.create({
          address: currentAccount.address,
          packageId: PACKAGE_ID,
          ttlMin: 10,
          suiClient,
        });

        await new Promise<void>((resolve, reject) => {
          signPersonalMessage(
            { message: newSessionKey.getPersonalMessage() },
            {
              onSuccess: async (result) => {
                await newSessionKey.setPersonalMessageSignature(result.signature);
                setSessionKey(newSessionKey);
                currentSessionKey = newSessionKey;
                resolve();
              },
              onError: reject,
            }
          );
        });
      }

      if (!currentSessionKey) throw new Error("Failed to create session key");

      toast.info("Downloading from Walrus...");
      const response = await fetch(`${WALRUS_AGGREGATOR_URL}${sub.blobId}`);
      if (!response.ok) throw new Error("Failed to download from Walrus");
      
      const encryptedData = new Uint8Array(await response.arrayBuffer());
      const idBytes = fromHex(sub.encryptionId);
      
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::seal_approve`,
        arguments: [
          tx.pure.vector('u8', idBytes),
          tx.object(sub.id),
          tx.object(sub.datasetId),
          tx.object('0x6'),
        ],
      });

      const txBytes = await tx.build({ 
        client: suiClient, 
        onlyTransactionKind: true 
      });
      
      toast.info("Fetching decryption keys...");
      await client.fetchKeys({
        ids: [sub.encryptionId],
        txBytes,
        sessionKey: currentSessionKey,
        threshold: 2,
      });

      toast.info("Decrypting audio...");
      const decryptedData = await client.decrypt({
        data: encryptedData,
        sessionKey: currentSessionKey,
        txBytes,
      });

      const decryptedBuffer = new Uint8Array(decryptedData);
      const blob = new Blob([decryptedBuffer], { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voice-${sub.language}-${sub.dialect}-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download complete!");
    } catch (error: any) {
      console.error("Download error:", error);
      toast.error(`Download failed: ${error.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    if (!showExpired && sub.isExpired) return false;
    if (selectedLanguage && sub.language !== selectedLanguage) return false;
    if (selectedDialect && sub.dialect !== selectedDialect) return false;
    return true;
  });

  const availableDialects = selectedLanguage 
    ? availableLanguages.find(l => l.name === selectedLanguage)?.dialects || []
    : [];

  const activeCount = subscriptions.filter(s => !s.isExpired).length;
  const expiredCount = subscriptions.filter(s => s.isExpired).length;
  const totalCount = subscriptions.length;

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
            MY SUBSCRIPTIONS
          </h1>

          {!currentAccount ? (
            <Card className="p-8 text-center neon-border bg-card/80 backdrop-blur">
              <p className="text-xl text-primary">
                Please connect your wallet to view subscriptions
              </p>
            </Card>
          ) : loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
          ) : subscriptions.length === 0 ? (
            <Card className="p-8 text-center neon-border bg-card/80 backdrop-blur">
              <Database className="w-16 h-16 text-secondary mx-auto mb-4" />
              <p className="text-xl text-primary mb-2">No Subscriptions Yet</p>
              <p className="text-muted-foreground">
                Purchase voice datasets from the marketplace to access them here
              </p>
            </Card>
          ) : (
            <>
              {/* Simplified Statistics - Only 3 cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="p-4 neon-border bg-card/80 backdrop-blur">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-accent">{totalCount}</p>
                    <p className="text-sm text-muted-foreground">Total</p>
                  </div>
                </Card>
                <Card className="p-4 neon-border bg-card/80 backdrop-blur">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-primary">{activeCount}</p>
                    <p className="text-sm text-muted-foreground">Active</p>
                  </div>
                </Card>
                <Card className="p-4 neon-border bg-card/80 backdrop-blur">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-destructive">{expiredCount}</p>
                    <p className="text-sm text-muted-foreground">Expired</p>
                  </div>
                </Card>
              </div>

              {/* Filters */}
              <Card className="p-6 mb-8 neon-border bg-card/80 backdrop-blur">
                <div className="space-y-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <Filter className="w-6 h-6 text-primary" />
                    <span className="text-lg font-bold text-primary">Status:</span>
                    <Button
                      variant={showExpired ? "default" : "outline"}
                      onClick={() => setShowExpired(true)}
                      size="sm"
                    >
                      Show All
                    </Button>
                    <Button
                      variant={!showExpired ? "default" : "outline"}
                      onClick={() => setShowExpired(false)}
                      size="sm"
                    >
                      Active Only
                    </Button>
                  </div>

                  {availableLanguages.length > 1 && (
                    <div className="flex items-center gap-4 flex-wrap border-t border-primary/20 pt-4">
                      <Languages className="w-6 h-6 text-secondary" />
                      <span className="text-lg font-bold text-secondary">Language:</span>
                      <Button
                        variant={selectedLanguage === "" ? "default" : "outline"}
                        onClick={() => {
                          setSelectedLanguage("");
                          setSelectedDialect("");
                        }}
                        size="sm"
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
                          size="sm"
                        >
                          {lang.name}
                        </Button>
                      ))}
                    </div>
                  )}

                  {selectedLanguage && availableDialects.length > 1 && (
                    <div className="flex items-center gap-4 flex-wrap border-t border-secondary/20 pt-4">
                      <Clock className="w-6 h-6 text-accent" />
                      <span className="text-lg font-bold text-accent">Dialect:</span>
                      <Button
                        variant={selectedDialect === "" ? "default" : "outline"}
                        onClick={() => setSelectedDialect("")}
                        size="sm"
                      >
                        All Dialects
                      </Button>
                      {availableDialects.map(dialect => (
                        <Button
                          key={dialect}
                          variant={selectedDialect === dialect ? "default" : "outline"}
                          onClick={() => setSelectedDialect(dialect)}
                          size="sm"
                        >
                          {dialect}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Individual Subscriptions Only - No Bulk Section */}
              <div>
                <h2 className="text-2xl font-bold text-primary mb-4">
                  Your Subscriptions ({filteredSubscriptions.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredSubscriptions.map((sub) => (
                    <Card
                      key={sub.id}
                      className={`p-6 transition-all neon-border bg-card/80 backdrop-blur ${sub.isExpired ? 'opacity-60' : ''}`}
                    >
                      {sub.isExpired && (
                        <div className="mb-4 p-2 bg-destructive/20 border border-destructive rounded flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-destructive" />
                          <span className="text-xs text-destructive font-bold">EXPIRED</span>
                        </div>
                      )}
                      
                      <div className="mb-4">
                        <h3 className="text-xl font-bold text-primary mb-2">
                          {sub.language} - {sub.dialect}
                        </h3>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>Duration: {sub.durationLabel}</p>
                          <p>Purchased: {new Date(sub.createdAt).toLocaleDateString()}</p>
                          <p>For: {sub.daysPurchased} day{sub.daysPurchased !== 1 ? 's' : ''}</p>
                          {sub.discountApplied > 0 && (
                            <p className="text-accent font-bold">
                              Discount: {formatPrice(sub.discountApplied)} SUI
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="w-4 h-4" />
                            <span className={`font-bold ${sub.isExpired ? 'text-destructive' : 'text-accent'}`}>
                              {sub.timeRemaining}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={() => handleDownload(sub)}
                        disabled={downloading === sub.id || sub.isExpired}
                        className={`w-full font-bold ${
                          sub.isExpired 
                            ? 'bg-gray-500 opacity-50 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-primary to-secondary text-background'
                        }`}
                      >
                        {downloading === sub.id ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            DOWNLOADING...
                          </>
                        ) : sub.isExpired ? (
                          'EXPIRED - RENEW TO ACCESS'
                        ) : (
                          <>
                            <Download className="w-5 h-5 mr-2" />
                            DOWNLOAD
                          </>
                        )}
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MySubscriptions;