import React, { useState } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import { SealClient } from '@mysten/seal';
import { toHex } from '@mysten/sui/utils';
import { toast } from "sonner";

interface WalrusEncryptUploadProps {
  audioBlob: Blob;
  language: string;
  dialect: string;
  duration: string;
  durationId: string;
  registryId: string;
  onSuccess: (datasetInfo: DatasetInfo) => void;
}

type DatasetInfo = {
  blobId: string;
  datasetId: string;
  txDigest: string;
};

const PACKAGE_ID = "0x65fa4fb259e3573326f4949959220224795c9c4888f15bbbbb2befd9e3457d3c";
const SERVER_OBJECT_IDS = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8"
];

const WALRUS_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";

// Helper function to parse duration string to seconds
const parseDurationToSeconds = (duration: string): number => {
  if (duration === "30 seconds") return 30;
  if (duration === "1 minute") return 60;
  if (duration === "2 minutes") return 120;
  if (duration === "5 minutes") return 300;
  
  // Try to extract number from custom duration labels
  const match = duration.match(/(\d+)\s*(second|minute|min|sec)/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('min')) return value * 60;
    return value;
  }
  
  return 30; // Default
};

export const WalrusEncryptUpload: React.FC<WalrusEncryptUploadProps> = ({
  audioBlob,
  language,
  dialect,
  duration,
  durationId,
  registryId,
  onSuccess,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo | null>(null);
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const client = new SealClient({
    suiClient,
    serverConfigs: SERVER_OBJECT_IDS.map((id) => ({
      objectId: id,
      weight: 1,
    })),
    verifyKeyServers: false,
  });

  const handleUpload = async () => {
    if (!currentAccount?.address) {
      toast.error("Please connect your wallet");
      return;
    }

    setIsUploading(true);
    console.log('=== Upload Started ===');
    
    try {
      // 1. Read audio file as ArrayBuffer
      console.log('Step 1: Reading audio file...');
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = new Uint8Array(arrayBuffer);
      console.log('✓ Audio file read:', audioData.length, 'bytes');

      // 2. Create encryption ID
      console.log('Step 2: Creating encryption ID...');
      const tempDatasetId = crypto.getRandomValues(new Uint8Array(32));
      const nonce = crypto.getRandomValues(new Uint8Array(5));
      const encryptionIdBytes = new Uint8Array([...tempDatasetId, ...nonce]);
      const id = toHex(encryptionIdBytes);
      console.log('✓ Encryption ID created:', id);

      // 3. Encrypt the audio data
      console.log('Step 3: Encrypting audio data...');
      toast.info("Encrypting audio data...");
      const { encryptedObject: encryptedBytes } = await client.encrypt({
        threshold: 2,
        packageId: PACKAGE_ID,
        id,
        data: audioData,
      });
      console.log('✓ Audio encrypted:', encryptedBytes.length, 'bytes');

      // 4. Upload encrypted data to Walrus
      console.log('Step 4: Uploading to Walrus...');
      toast.info("Uploading to Walrus...");
      const walrusUrl = `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=1`;
      
      const encryptedBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });
      
      const response = await fetch(walrusUrl, {
        method: 'PUT',
        body: encryptedBlob,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Walrus error response:', errorText);
        throw new Error(`Walrus upload failed: ${errorText}`);
      }

      const storageInfo = await response.json();
      console.log('✓ Walrus storage response:', storageInfo);
      
      let blobId: string;
      if ('alreadyCertified' in storageInfo) {
        blobId = storageInfo.alreadyCertified.blobId;
      } else if ('newlyCreated' in storageInfo) {
        blobId = storageInfo.newlyCreated.blobObject.blobId;
      } else {
        throw new Error('Unexpected storage response format');
      }

      // 5. Create dataset on Sui blockchain with on-chain category validation
      console.log('Step 5: Creating dataset on blockchain...');
      toast.info("Creating dataset on blockchain...");
      const createTx = new Transaction();
      
      createTx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::create_dataset_entry`,
        arguments: [
          createTx.object(registryId),        // CategoryRegistry
          createTx.pure.string(language),     // Language name
          createTx.pure.string(dialect),      // Dialect name
          createTx.object(durationId),        // DurationOption object
          createTx.pure.string(blobId),       // Blob ID
          createTx.pure.vector('u8', encryptionIdBytes), // Encryption ID
          createTx.object('0x6'),             // Clock object
        ],
      });

      createTx.setGasBudget(10000000);
      
      // Execute and get BOTH datasetId and capId
      const { datasetId, capId } = await new Promise<{ datasetId: string; capId: string }>((resolve, reject) => {
        signAndExecute(
          { transaction: createTx },
          {
            onSuccess: async (result: any) => {
              console.log('Step 6: Dataset created, transaction:', result.digest);
              
              // Wait for indexing
              await new Promise(r => setTimeout(r, 3000));
              
              try {
                // Get transaction details to find created objects
                const txDetails = await suiClient.getTransactionBlock({
                  digest: result.digest,
                  options: {
                    showEffects: true,
                    showObjectChanges: true,
                  },
                });
                
                console.log('Transaction details:', JSON.stringify(txDetails, null, 2));
                
                // Find VoiceDataset and DatasetCap from objectChanges
                let foundDatasetId = '';
                let foundCapId = '';
                
                if (txDetails.objectChanges) {
                  for (const change of txDetails.objectChanges) {
                    if (change.type === 'created') {
                      const objectType = change.objectType || '';
                      
                      // Check if it's VoiceDataset
                      if (objectType.includes('voice_marketplace::VoiceDataset')) {
                        foundDatasetId = change.objectId;
                        console.log('✓ Found VoiceDataset:', foundDatasetId);
                      }
                      
                      // Check if it's DatasetCap
                      if (objectType.includes('voice_marketplace::DatasetCap')) {
                        foundCapId = change.objectId;
                        console.log('✓ Found DatasetCap:', foundCapId);
                      }
                    }
                  }
                }
                
                if (!foundDatasetId || !foundCapId) {
                  console.error('Could not find both objects');
                  console.log('Found dataset:', foundDatasetId);
                  console.log('Found cap:', foundCapId);
                  reject(new Error('Could not find dataset and cap IDs'));
                  return;
                }
                
                resolve({ datasetId: foundDatasetId, capId: foundCapId });
              } catch (error) {
                console.error('Error fetching transaction details:', error);
                reject(error);
              }
            },
            onError: (error: any) => {
              console.error('✗ Create dataset error:', error);
              const errorMsg = error?.message || 'Unknown error';
              
              // Handle specific contract errors with user-friendly messages
              if (errorMsg.includes('ELanguageNotFound') || errorMsg.includes('4')) {
                reject(new Error(`Language "${language}" not found. Please add it first.`));
              } else if (errorMsg.includes('EDialectNotFound') || errorMsg.includes('5')) {
                reject(new Error(`Dialect "${dialect}" not found for ${language}. Please add it first.`));
              } else {
                reject(error);
              }
            },
          }
        );
      });

      // 6. Publish blob to dataset using the Cap
      console.log('Step 7: Publishing blob to dataset...');
      console.log('Using datasetId:', datasetId);
      console.log('Using capId:', capId);
      toast.info("Attaching blob to dataset...");
      
      await new Promise<void>((resolve, reject) => {
        const publishTx = new Transaction();
        publishTx.setGasBudget(10000000);
        
        publishTx.moveCall({
          target: `${PACKAGE_ID}::voice_marketplace::publish_entry`,
          arguments: [
            publishTx.object(datasetId),     // VoiceDataset object
            publishTx.object(capId),         // DatasetCap object (separate!)
            publishTx.pure.string(blobId),   // blob_id
            publishTx.object('0x6'),         // Clock object
          ],
        });

        signAndExecute(
          { transaction: publishTx },
          {
            onSuccess: (result: any) => {
              console.log('✓ Blob attached successfully!');
              toast.success("Dataset published to marketplace!");
              
              const info: DatasetInfo = {
                blobId: blobId,
                datasetId: datasetId,
                txDigest: result.digest,
              };
              setDatasetInfo(info);
              onSuccess(info);
              setIsUploading(false);
              resolve();
            },
            onError: (error: any) => {
              console.error('✗ Publish error:', error);
              toast.error("Failed to attach blob: " + (error?.message || 'Unknown error'));
              setIsUploading(false);
              reject(error);
            },
          }
        );
      });

      console.log('=== Upload Completed ===');
    } catch (error: any) {
      console.error('=== Upload Failed ===');
      console.error('Error:', error);
      toast.error(`Upload failed: ${error?.message || 'Unknown error'}`);
      setIsUploading(false);
    }
  };

  // Calculate price preview based on duration
  const durationSeconds = parseDurationToSeconds(duration);
  const pricePerDay = (durationSeconds / 30) * 0.001;

  return (
    <Card className="p-6 neon-border bg-card/80 backdrop-blur">
      <div className="text-center">
        <h3 className="text-xl font-bold text-primary mb-4">
          Publish to Marketplace
        </h3>
        <p className="text-sm text-muted-foreground mb-2">
          Your voice recording will be encrypted and uploaded to Walrus.
        </p>
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-lg">
          <p className="text-sm font-bold text-accent">
            💰 Pricing: {pricePerDay.toFixed(4)} SUI per day
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Duration: {duration} • Buyers can choose subscription length
          </p>
        </div>
        
        {!datasetInfo ? (
          <Button
            size="lg"
            onClick={handleUpload}
            disabled={isUploading || !currentAccount}
            className="bg-gradient-to-r from-primary to-secondary text-background font-bold px-8 py-4 pixel-border"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                UPLOADING...
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 mr-2" />
                PUBLISH TO MARKETPLACE
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-4 text-left">
            <div className="bg-background/50 border border-primary/30 rounded-lg p-4">
              <h4 className="font-bold text-primary mb-4">✓ Dataset Published Successfully!</h4>
              
              <div className="space-y-4">
                <div className="border border-secondary/30 rounded p-3 bg-background/30">
                  <dt className="text-muted-foreground font-semibold mb-2">Walrus Encrypted Blob</dt>
                  <dd className="text-foreground break-all font-mono text-xs mb-3 p-2 bg-background rounded">{datasetInfo.blobId}</dd>
                  <a
                    href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${datasetInfo.blobId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-secondary hover:text-secondary/80 underline font-semibold"
                  >
                    View Encrypted Blob on Walrus →
                  </a>
                </div>
                
                <div className="border border-accent/30 rounded p-3 bg-background/30">
                  <dt className="text-muted-foreground font-semibold mb-2">Sui Blockchain Object</dt>
                  <dd className="text-foreground break-all font-mono text-xs mb-3 p-2 bg-background rounded">{datasetInfo.datasetId}</dd>
                  <a
                    href={`https://suiscan.xyz/testnet/object/${datasetInfo.datasetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent/80 underline font-semibold"
                  >
                    View on Suiscan Explorer →
                  </a>
                </div>
              </div>
            </div>
            
            <Button
              size="lg"
              onClick={() => {
                setDatasetInfo(null);
                window.location.reload();
              }}
              className="w-full bg-primary hover:bg-primary/90 text-background font-bold"
            >
              Publish Another Recording
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default WalrusEncryptUpload