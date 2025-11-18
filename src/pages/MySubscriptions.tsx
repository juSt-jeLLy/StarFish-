import { useState, useEffect } from "react";
import { useCurrentAccount, useSuiClient, useSignPersonalMessage } from "@mysten/dapp-kit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Download, Loader2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import spaceBg from "@/assets/space-bg.jpg";
import { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex } from '@mysten/sui/utils';
import { toast } from "sonner";

const PACKAGE_ID = "0xbab968bc9afe161a564f9d765b9d24e18d80f6b02406061cca8003643bfb8100";
const SERVER_OBJECT_IDS = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8"
];
const WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space/v1/blobs/";

interface SubscriptionData {
  id: string;
  datasetId: string;
  createdAt: number;
  language: string;
  dialect: string;
  duration: string;
  blobId: string;
  encryptionId: string;
}

const MySubscriptions = () => {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const { mutate: signPersonalMessage } = useSignPersonalMessage();

  const client = new SealClient({
    suiClient,
    serverConfigs: SERVER_OBJECT_IDS.map((id) => ({
      objectId: id,
      weight: 1,
    })),
    verifyKeyServers: false,
  });

  useEffect(() => {
    if (currentAccount?.address) {
      loadSubscriptions();
      const interval = setInterval(loadSubscriptions, 30000); // Reduced to 30 seconds
      return () => clearInterval(interval);
    }
  }, [currentAccount?.address]);

  const loadSubscriptions = async () => {
    if (!currentAccount?.address) return;

    try {
      const result = await suiClient.getOwnedObjects({
        owner: currentAccount.address,
        options: { showContent: true, showType: true },
        filter: {
          StructType: `${PACKAGE_ID}::voice_marketplace::Subscription`,
        },
      });

      const subsData: SubscriptionData[] = await Promise.all(
        result.data.map(async (obj) => {
          const fields = (obj.data?.content as any)?.fields;
          if (!fields) return null;

          // Get dataset details
          const dataset = await suiClient.getObject({
            id: fields.dataset_id,
            options: { 
              showContent: true,
              showBcs: true,
            },
          });

          const datasetFields = (dataset.data?.content as any)?.fields;
          if (!datasetFields) return null;

          // Get the encryption_id from the dataset
          let encryptionId = "";
          if (datasetFields.encryption_id) {
            const encryptionIdBytes = datasetFields.encryption_id;
            encryptionId = toHex(new Uint8Array(encryptionIdBytes));
            console.log('✓ Found encryption_id:', encryptionId);
          } else {
            console.warn('No encryption_id found in dataset');
            return null;
          }

          // Use the blob_id directly from dataset (NO DYNAMIC FIELD LOOKUP)
          const blobId = datasetFields.blob_id;
          console.log('Using blob_id from dataset:', blobId);

          return {
            id: fields.id.id,
            datasetId: fields.dataset_id,
            createdAt: parseInt(fields.created_at),
            language: datasetFields.language,
            dialect: datasetFields.dialect,
            duration: datasetFields.duration,
            blobId: blobId,
            encryptionId: encryptionId,
          };
        })
      );

      setSubscriptions(subsData.filter(Boolean) as SubscriptionData[]);
    } catch (error) {
      console.error("Error loading subscriptions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (sub: SubscriptionData) => {
    if (!currentAccount?.address) return;

    setDownloading(sub.id);

    try {
      // Create or use existing session key
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

      // Download encrypted data from Walrus
      toast.info("Downloading from Walrus...");
      const response = await fetch(`${WALRUS_AGGREGATOR_URL}${sub.blobId}`);
      if (!response.ok) throw new Error("Failed to download from Walrus");
      
      const encryptedData = new Uint8Array(await response.arrayBuffer());

      // Use the stored encryption ID
      const idBytes = fromHex(sub.encryptionId);
      
      // Build transaction
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

      // Decrypt the data
      toast.info("Decrypting audio...");
      const decryptedData = await client.decrypt({
        data: encryptedData,
        sessionKey: currentSessionKey,
        txBytes,
      });

      // Download the file
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

  // Add a manual refresh button
  const handleRefresh = () => {
    setLoading(true);
    loadSubscriptions();
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
          <div className="flex justify-between items-center mb-12">
            <h1 className="text-4xl md:text-6xl font-bold neon-text glitch">
              MY SUBSCRIPTIONS
            </h1>
            <Button 
              onClick={handleRefresh}
              disabled={loading}
              className="bg-primary hover:bg-primary/90"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          {!currentAccount ? (
            <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
              <p className="text-xl text-primary">
                Please connect your wallet to view subscriptions
              </p>
            </Card>
          ) : loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
          ) : subscriptions.length === 0 ? (
            <Card className="p-8 neon-border bg-card/80 backdrop-blur text-center">
              <Database className="w-16 h-16 text-secondary mx-auto mb-4" />
              <p className="text-xl text-primary mb-2">No Active Subscriptions</p>
              <p className="text-muted-foreground">
                Purchase voice datasets from the marketplace to access them here
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {subscriptions.map((sub) => (
                <Card
                  key={sub.id}
                  className="p-6 neon-border bg-card/80 backdrop-blur hover-lift"
                >
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-primary mb-2">
                      {sub.language} - {sub.dialect}
                    </h3>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>Duration: {sub.duration}</p>
                      <p>Purchased: {new Date(sub.createdAt).toLocaleDateString()}</p>
                      <p className="text-xs break-all">Encryption ID: {sub.encryptionId.slice(0, 16)}...</p>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleDownload(sub)}
                    disabled={downloading === sub.id}
                    className="w-full bg-gradient-to-r from-primary to-secondary text-background font-bold pixel-border"
                  >
                    {downloading === sub.id ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        DOWNLOADING...
                      </>
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
          )}
        </div>
      </div>
    </div>
  );
};

export default MySubscriptions;