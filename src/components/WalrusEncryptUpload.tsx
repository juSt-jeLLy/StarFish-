import React, { useState } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useSignAndExecuteTransaction, useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2, CheckCircle, Lock, Cloud, Blocks, Link2 } from "lucide-react";
import { SealClient } from '@mysten/seal';
import { toHex } from '@mysten/sui/utils';
import { toast } from "sonner";
import { config } from '@/config/env';

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

type UploadStep = {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  icon: any;
  details?: string;
};

const PACKAGE_ID = config.packageId;
const SERVER_OBJECT_IDS = config.serverObjectIds;
const WALRUS_PUBLISHER_URL = config.walrus.publisherUrl;

// Helper function to parse duration string to seconds
const parseDurationToSeconds = (duration: string): number => {
  if (duration === "30 seconds") return 30;
  if (duration === "1 minute") return 60;
  if (duration === "2 minutes") return 120;
  if (duration === "5 minutes") return 300;
  
  const match = duration.match(/(\d+)\s*(second|minute|min|sec)/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('min')) return value * 60;
    return value;
  }
  
  return 30;
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
  const [uploadSteps, setUploadSteps] = useState<UploadStep[]>([
    { id: 'read', label: 'Reading audio file', status: 'pending', icon: Upload },
    { id: 'encrypt', label: 'Encrypting with SEAL', status: 'pending', icon: Lock },
    { id: 'upload', label: 'Uploading to Walrus', status: 'pending', icon: Cloud },
    { id: 'create', label: 'Creating dataset on Sui', status: 'pending', icon: Blocks },
    { id: 'publish', label: 'Publishing to marketplace', status: 'pending', icon: Link2 },
  ]);
  
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

  const updateStep = (stepId: string, status: UploadStep['status'], details?: string) => {
    setUploadSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status, details } : step
    ));
  };

  const handleUpload = async () => {
    if (!currentAccount?.address) {
      toast.error("Please connect your wallet");
      return;
    }

    setIsUploading(true);
    console.log('=== Upload Started ===');
    
    try {
      // Step 1: Read audio file
      updateStep('read', 'loading');
      console.log('Step 1: Reading audio file...');
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = new Uint8Array(arrayBuffer);
      console.log('✓ Audio file read:', audioData.length, 'bytes');
      updateStep('read', 'success', `${(audioData.length / 1024).toFixed(1)} KB`);
      await new Promise(r => setTimeout(r, 300));

      // Step 2: Create encryption ID and encrypt
      updateStep('encrypt', 'loading');
      console.log('Step 2: Creating encryption ID...');
      const tempDatasetId = crypto.getRandomValues(new Uint8Array(32));
      const nonce = crypto.getRandomValues(new Uint8Array(5));
      const encryptionIdBytes = new Uint8Array([...tempDatasetId, ...nonce]);
      const id = toHex(encryptionIdBytes);
      console.log('✓ Encryption ID created:', id);

      console.log('Step 3: Encrypting audio data...');
      const { encryptedObject: encryptedBytes } = await client.encrypt({
        threshold: 2,
        packageId: PACKAGE_ID,
        id,
        data: audioData,
      });
      console.log('✓ Audio encrypted:', encryptedBytes.length, 'bytes');
      updateStep('encrypt', 'success', `${(encryptedBytes.length / 1024).toFixed(1)} KB encrypted`);
      await new Promise(r => setTimeout(r, 300));

      // Step 3: Upload to Walrus
      updateStep('upload', 'loading');
      console.log('Step 4: Uploading to Walrus...');
      const walrusUrl = `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=30`;
      
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
        updateStep('upload', 'error', 'Upload failed');
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
        updateStep('upload', 'error', 'Unexpected response');
        throw new Error('Unexpected storage response format');
      }
      
      updateStep('upload', 'success', blobId.substring(0, 12) + '...');
      await new Promise(r => setTimeout(r, 500));

      // Step 4: Create dataset on blockchain
      updateStep('create', 'loading');
      console.log('Step 5: Creating dataset on blockchain...');
      const createTx = new Transaction();
      
      createTx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::create_dataset_entry`,
        arguments: [
          createTx.object(registryId),
          createTx.pure.string(language),
          createTx.pure.string(dialect),
          createTx.object(durationId),
          createTx.pure.string(blobId),
          createTx.pure.vector('u8', encryptionIdBytes),
          createTx.object('0x6'),
        ],
      });

      createTx.setGasBudget(10000000);
      
      const { datasetId, capId } = await new Promise<{ datasetId: string; capId: string }>((resolve, reject) => {
        signAndExecute(
          { transaction: createTx },
          {
            onSuccess: async (result: any) => {
              console.log('Step 6: Dataset created, transaction:', result.digest);
              
              await new Promise(r => setTimeout(r, 3000));
              
              try {
                const txDetails = await suiClient.getTransactionBlock({
                  digest: result.digest,
                  options: {
                    showEffects: true,
                    showObjectChanges: true,
                  },
                });
                
                console.log('Transaction details:', JSON.stringify(txDetails, null, 2));
                
                let foundDatasetId = '';
                let foundCapId = '';
                
                if (txDetails.objectChanges) {
                  for (const change of txDetails.objectChanges) {
                    if (change.type === 'created') {
                      const objectType = change.objectType || '';
                      
                      if (objectType.includes('voice_marketplace::VoiceDataset')) {
                        foundDatasetId = change.objectId;
                        console.log('✓ Found VoiceDataset:', foundDatasetId);
                      }
                      
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

      updateStep('create', 'success', datasetId.substring(0, 12) + '...');
      await new Promise(r => setTimeout(r, 500));

      // Step 5: Publish to marketplace
      updateStep('publish', 'loading');
      console.log('Step 7: Publishing blob to dataset...');
      console.log('Using datasetId:', datasetId);
      console.log('Using capId:', capId);
      
      await new Promise<void>((resolve, reject) => {
        const publishTx = new Transaction();
        publishTx.setGasBudget(10000000);
        
        publishTx.moveCall({
          target: `${PACKAGE_ID}::voice_marketplace::publish_entry`,
          arguments: [
            publishTx.object(datasetId),
            publishTx.object(capId),
            publishTx.pure.string(blobId),
            publishTx.object('0x6'),
          ],
        });

        signAndExecute(
          { transaction: publishTx },
          {
            onSuccess: (result: any) => {
              console.log('✓ Blob attached successfully!');
              
              updateStep('publish', 'success', 'Live on marketplace');
              
              const info: DatasetInfo = {
                blobId: blobId,
                datasetId: datasetId,
                txDigest: result.digest,
              };
              
              setTimeout(() => {
                setDatasetInfo(info);
                onSuccess(info);
                setIsUploading(false);
                toast.success("Dataset published to marketplace!");
              }, 500);
              
              resolve();
            },
            onError: (error: any) => {
              console.error('✗ Publish error:', error);
              updateStep('publish', 'error', error?.message || 'Unknown error');
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
          <>
            <Button
              size="lg"
              onClick={handleUpload}
              disabled={isUploading || !currentAccount}
              className="bg-gradient-to-r from-primary to-secondary text-background font-bold px-8 py-4 pixel-border mb-6"
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

            {/* Progress Modal Overlay - Like Recording Timer */}
            {isUploading && (
              <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/50">
                <div className="bg-background/95 border-4 border-primary rounded-lg px-8 py-6 max-w-md w-full mx-4 pointer-events-auto shadow-2xl" style={{ marginTop: '-45vh' }}>
                  <h4 className="text-2xl font-bold text-primary mb-6 text-center">Publishing Dataset</h4>
                  
                  <div className="space-y-3">
                    {uploadSteps.map((step, index) => {
                      const Icon = step.icon;
                      return (
                        <div 
                          key={step.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                            step.status === 'loading' 
                              ? 'bg-primary/20 border-primary' 
                              : step.status === 'success'
                              ? 'bg-accent/20 border-accent'
                              : step.status === 'error'
                              ? 'bg-destructive/20 border-destructive'
                              : 'bg-background/50 border-muted/30'
                          }`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {step.status === 'loading' && (
                              <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            )}
                            {step.status === 'success' && (
                              <CheckCircle className="w-5 h-5 text-accent" />
                            )}
                            {step.status === 'pending' && (
                              <div className="w-5 h-5 rounded-full border-2 border-muted/50" />
                            )}
                            {step.status === 'error' && (
                              <div className="w-5 h-5 text-destructive">✗</div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <p className={`font-semibold text-sm ${
                                step.status === 'loading' 
                                  ? 'text-primary' 
                                  : step.status === 'success'
                                  ? 'text-accent'
                                  : step.status === 'error'
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                              }`}>
                                {step.label}
                              </p>
                            </div>
                            {step.details && (
                              <p className="text-xs text-muted-foreground mt-1 font-mono">
                                {step.details}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <p className="text-center text-sm text-muted-foreground mt-6">
                    Please don't close this window...
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 text-left">
            <div className="bg-background/50 border border-primary/30 rounded-lg p-4">
              <h4 className="font-bold text-primary mb-4">✓ Dataset Published Successfully!</h4>
              
              <div className="space-y-4">
                <div className="border border-secondary/30 rounded p-3 bg-background/30">
                  <dt className="text-muted-foreground font-semibold mb-2">Walrus Encrypted Blob</dt>
                  <dd className="text-foreground break-all font-mono text-xs mb-3 p-2 bg-background rounded">{datasetInfo.blobId}</dd>
                  <a
                    href={`https://walruscan.com/testnet/blob/${datasetInfo.blobId}`}
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

export default WalrusEncryptUpload;