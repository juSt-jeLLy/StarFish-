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

const PACKAGE_ID = "0x59a6ee02e71ec4dc901f47b795aeea6bc5e0f424d9daeecddf645ef9b063afff";
const SERVER_OBJECT_IDS = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8"
];
const WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";

interface SubscriptionData {
  id: string;
  datasetId: string;
  createdAt: number;
  language: string;
  dialect: string;
  duration: string;
  blobId: string;
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
      const interval = setInterval(loadSubscriptions, 5000);
      return () => clearInterval(interval);
    }
  }, [currentAccount?.address]);

  const loadSubscriptions = async () => {
    if (!currentAccount?.address) return;

    try {
      // Get all subscription objects owned by user
      const result = await suiClient.getOwnedObjects({
        owner: currentAccount.address,
        options: {
          showContent: true,
          showType: true,
        },
        filter: {
          StructType: `${PACKAGE_ID}::voice_marketplace::Subscription`,
        },
      });

      // Load dataset details for each subscription
      const subsData: SubscriptionData[] = await Promise.all(
        result.data.map(async (obj) => {
          const fields = (obj.data?.content as any)?.fields;
          if (!fields) return null;

          // Get dataset details
          const dataset = await suiClient.getObject({
            id: fields.dataset_id,
            options: { showContent: true },
          });

          const datasetFields = (dataset.data?.content as any)?.fields;
          if (!datasetFields) return null;

          return {
            id: fields.id.id,
            datasetId: fields.dataset_id,
            createdAt: parseInt(fields.created_at),
            language: datasetFields.language,
            dialect: datasetFields.dialect,
            duration: datasetFields.duration,
            blobId: datasetFields.blob_id,
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
      const response = await fetch(`${WALRUS_AGGREGATOR_URL}/v1/${sub.blobId}`);
      if (!response.ok) throw new Error("Failed to download from Walrus");
      
      const encryptedData = new Uint8Array(await response.arrayBuffer());

      // Get decryption keys
      const id = toHex(fromHex(sub.datasetId));
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::seal_approve`,
        arguments: [
          tx.pure.vector('u8', fromHex(id)),
          tx.object(sub.id),
          tx.object(sub.datasetId),
        ],
      });

      const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
      
      toast.info("Fetching decryption keys...");
      await client.fetchKeys({
        ids: [id],
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
      const blob = new Blob([decryptedBuffer], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voice-${sub.language}-${sub.dialect}-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download complete!");
    } catch (error) {
      console.error("Download error:", error);
      toast.error(`Download failed: ${error.message}`);
    } finally {
      setDownloading(null);
    }
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
            MY SUBSCRIPTIONS
          </h1>

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