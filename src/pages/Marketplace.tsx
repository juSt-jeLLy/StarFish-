import { useState, useEffect } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Database, Languages, ShoppingCart, Loader2, Filter, Clock, X, Star, Tag, CheckSquare, Square } from "lucide-react";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";

const PACKAGE_ID = "0xaeb46ee2312a97f98095b3dca0993790337ec0ec9fd0692dd4979a004f3d187c";
const REGISTRY_ID = "0x6e63e83940043054c5e156b0e3c55f37dcb3f46d61986e0f4cf75d1e916df3a9";
const BASE_PRICE_PER_DAY = 1_000_000;

interface DatasetData {
  id: string;
  creator: string;
  language: string;
  dialect: string;
  durationLabel: string;
  durationSeconds: number;
  blobId: string;
  createdAt: number;
  languageCreator: string;
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
  const [purchasing, setPurchasing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [selectedDialect, setSelectedDialect] = useState<string>("");
  const [myDatasets, setMyDatasets] = useState<Set<string>>(new Set());
  const [mySubscriptions, setMySubscriptions] = useState<Set<string>>(new Set());
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageData[]>([]);
  const [creatorDiscountPercent, setCreatorDiscountPercent] = useState<number>(20);
  const [languageCreators, setLanguageCreators] = useState<Map<string, string>>(new Map());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);

  useEffect(() => {
    loadMarketplace();
    const interval = setInterval(loadMarketplace, 10000);
    return () => clearInterval(interval);
  }, [currentAccount?.address]);

  const calculatePrice = (durationSeconds: number, days: number): number => {
    const durationMultiplier = durationSeconds / 30;
    return BASE_PRICE_PER_DAY * durationMultiplier * days;
  };

  const calculateDiscountedPrice = (originalPrice: number, discountPercent: number): { finalPrice: number; discountAmount: number } => {
    const discountAmount = Math.floor((originalPrice * discountPercent) / 100);
    const finalPrice = originalPrice - discountAmount;
    return { finalPrice, discountAmount };
  };

  const formatPrice = (mist: number): string => {
    return (mist / 1_000_000_000).toFixed(4);
  };

  const isLanguageCreator = (language: string): boolean => {
    if (!currentAccount?.address) return false;
    const creator = languageCreators.get(language);
    return creator === currentAccount.address;
  };

  const loadMarketplace = async () => {
    try {
      const registry = await suiClient.getObject({
        id: REGISTRY_ID,
        options: { showContent: true },
      });

      const registryFields = (registry.data?.content as any)?.fields;
      if (registryFields?.creator_discount_percent) {
        setCreatorDiscountPercent(parseInt(registryFields.creator_discount_percent));
      }

      if (registryFields?.languages?.fields?.contents) {
        const languagesMap = registryFields.languages.fields.contents;
        const creatorsMap = new Map<string, string>();
        for (const entry of languagesMap) {
          const langName = entry.fields.key;
          const langData = entry.fields.value.fields;
          creatorsMap.set(langName, langData.created_by);
        }
        setLanguageCreators(creatorsMap);
      }

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

            const languageCreator = languageCreators.get(fields.language) || "";

            return {
              id: datasetId,
              creator: fields.creator,
              language: fields.language,
              dialect: fields.dialect,
              durationLabel: fields.duration_label,
              durationSeconds: parseInt(fields.duration_seconds),
              blobId: fields.blob_id,
              createdAt: parseInt(fields.created_at),
              languageCreator,
            };
          } catch (err) {
            console.error("Error loading dataset:", datasetId, err);
            return null;
          }
        })
      );

      const validDatasets = datasetsData.filter(Boolean) as DatasetData[];
      setDatasets(validDatasets);

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

  const toggleDatasetSelection = (datasetId: string) => {
    const newSelection = new Set(selectedDatasets);
    if (newSelection.has(datasetId)) {
      newSelection.delete(datasetId);
    } else {
      newSelection.add(datasetId);
    }
    setSelectedDatasets(newSelection);
  };

  const selectAllFiltered = () => {
    const selectableDatasets = filteredDatasets.filter(d => 
      !myDatasets.has(d.id) && 
      !mySubscriptions.has(d.id) && 
      d.creator !== currentAccount?.address
    );
    setSelectedDatasets(new Set(selectableDatasets.map(d => d.id)));
    toast.success(`Selected ${selectableDatasets.length} datasets`);
  };

  const clearSelection = () => {
    setSelectedDatasets(new Set());
  };

  const openBulkPurchaseModal = () => {
    if (selectedDatasets.size === 0) {
      toast.error("Please select at least one dataset");
      return;
    }
    setSelectedDays(7);
    setShowPurchaseModal(true);
  };

  const closePurchaseModal = () => {
    setShowPurchaseModal(false);
    setSelectedDays(7);
  };

  const calculateBulkPrice = () => {
    const selectedDatasetsList = Array.from(selectedDatasets)
      .map(id => datasets.find(d => d.id === id))
      .filter(Boolean) as DatasetData[];

    let totalOriginal = 0;
    let totalDiscount = 0;

    selectedDatasetsList.forEach(dataset => {
      const originalPrice = calculatePrice(dataset.durationSeconds, selectedDays);
      totalOriginal += originalPrice;

      if (isLanguageCreator(dataset.language)) {
        const { discountAmount } = calculateDiscountedPrice(originalPrice, creatorDiscountPercent);
        totalDiscount += discountAmount;
      }
    });

    return {
      totalOriginal,
      totalDiscount,
      totalFinal: totalOriginal - totalDiscount,
    };
  };

  const handleBulkPurchase = async () => {
    if (!currentAccount?.address || selectedDatasets.size === 0) {
      toast.error("Please connect your wallet and select datasets");
      return;
    }

    const selectedDatasetsList = Array.from(selectedDatasets)
      .map(id => datasets.find(d => d.id === id))
      .filter(Boolean) as DatasetData[];

    if (selectedDatasetsList.length < 2 || selectedDatasetsList.length > 10) {
      toast.error("Please select between 2 and 10 datasets for bulk purchase");
      return;
    }

    const { totalFinal } = calculateBulkPrice();

    setPurchasing(true);

    try {
      const tx = new Transaction();
      tx.setGasBudget(30000000);

      const [paymentCoin] = tx.splitCoins(tx.gas, [totalFinal]);

      // Determine which bulk function to call based on count
      const count = selectedDatasetsList.length;
      const functionName = `subscribe_bulk_${count}`;

      const args = [
        tx.object(REGISTRY_ID),
        paymentCoin,
        ...selectedDatasetsList.map(d => tx.object(d.id)),
        tx.pure.u64(selectedDays),
        tx.object('0x6'),
      ];

      tx.moveCall({
        target: `${PACKAGE_ID}::voice_marketplace::${functionName}`,
        arguments: args,
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            console.log("Bulk purchase successful:", result.digest);
            toast.success(`🎉 Bulk subscription purchased for ${selectedDatasets.size} datasets!`);
            closePurchaseModal();
            clearSelection();
            setBulkSelectMode(false);
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
      setPurchasing(false);
    }
  };

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

  const availableDialects = selectedLanguage 
    ? availableLanguages.find(l => l.name === selectedLanguage)?.dialects || []
    : [];

  const getPriceDisplay = (dataset: DatasetData) => {
    const pricePerDay = calculatePrice(dataset.durationSeconds, 1);
    const userIsCreator = isLanguageCreator(dataset.language);
    
    if (userIsCreator) {
      const { finalPrice, discountAmount } = calculateDiscountedPrice(pricePerDay, creatorDiscountPercent);
      return {
        hasDiscount: true,
        originalPrice: formatPrice(pricePerDay),
        finalPrice: formatPrice(finalPrice),
        discountPercent: creatorDiscountPercent,
      };
    }
    
    return {
      hasDiscount: false,
      originalPrice: formatPrice(pricePerDay),
      finalPrice: formatPrice(pricePerDay),
      discountPercent: 0,
    };
  };

  const isSelectable = (dataset: DatasetData) => {
    return !myDatasets.has(dataset.id) && 
           !mySubscriptions.has(dataset.id) && 
           dataset.creator !== currentAccount?.address;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/80 p-8">
      <div className="container mx-auto max-w-7xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold">
            VOICE MARKETPLACE
          </h1>
          <Button
            onClick={() => setBulkSelectMode(!bulkSelectMode)}
            variant={bulkSelectMode ? "default" : "outline"}
            className="font-bold"
          >
            {bulkSelectMode ? "Exit Bulk Mode" : "Bulk Select"}
          </Button>
        </div>

        {bulkSelectMode && (
          <Card className="p-4 mb-6 bg-primary/10 border-primary">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <p className="font-bold text-primary">
                  {selectedDatasets.size} dataset(s) selected
                </p>
                <Button
                  onClick={selectAllFiltered}
                  variant="outline"
                  size="sm"
                  disabled={filteredDatasets.filter(isSelectable).length === 0}
                >
                  Select All Filtered
                </Button>
                <Button
                  onClick={clearSelection}
                  variant="ghost"
                  size="sm"
                  disabled={selectedDatasets.size === 0}
                >
                  Clear Selection
                </Button>
              </div>
              <Button
                onClick={openBulkPurchaseModal}
                disabled={selectedDatasets.size < 2 || selectedDatasets.size > 10}
                className="font-bold"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Purchase {selectedDatasets.size} Datasets
              </Button>
            </div>
            {selectedDatasets.size > 0 && selectedDatasets.size < 2 && (
              <p className="text-sm text-muted-foreground mt-2">
                Select at least 2 datasets for bulk purchase
              </p>
            )}
            {selectedDatasets.size > 10 && (
              <p className="text-sm text-destructive mt-2">
                Maximum 10 datasets per bulk purchase
              </p>
            )}
          </Card>
        )}
    
        <Card className="p-6 mb-8">
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
              >
                All Languages
              </Button>
              {availableLanguages.map(lang => {
                const userCreatedThis = isLanguageCreator(lang.name);
                return (
                  <Button
                    key={lang.name}
                    variant={selectedLanguage === lang.name ? "default" : "outline"}
                    onClick={() => {
                      setSelectedLanguage(lang.name);
                      setSelectedDialect("");
                    }}
                    className={userCreatedThis ? 'border-2 border-accent' : ''}
                  >
                    {lang.name}
                    {userCreatedThis && <Star className="w-4 h-4 ml-1 text-accent" />}
                    <span className="ml-2 text-xs opacity-70">({lang.dialects.length})</span>
                  </Button>
                );
              })}
            </div>

            {selectedLanguage && availableDialects.length > 0 && (
              <div className="flex items-center gap-4 flex-wrap border-t border-primary/20 pt-4">
                <Languages className="w-6 h-6 text-secondary" />
                <span className="text-lg font-bold text-secondary">Filter by Dialect:</span>
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
          <Card className="p-8 text-center">
            <Database className="w-16 h-16 text-secondary mx-auto mb-4" />
            <p className="text-xl text-primary mb-2">No Datasets Available</p>
            <p className="text-muted-foreground">
              {selectedLanguage || selectedDialect
                ? `No datasets found for the selected filters`
                : "Be the first to record and publish a voice dataset!"}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDatasets.map((dataset) => {
              const buttonState = getButtonState(dataset);
              const priceInfo = getPriceDisplay(dataset);
              const isSelected = selectedDatasets.has(dataset.id);
              const canSelect = isSelectable(dataset);
              
              return (
                <Card
                  key={dataset.id}
                  className={`p-6 relative transition-all ${
                    priceInfo.hasDiscount ? 'border-accent border-2' : ''
                  } ${
                    bulkSelectMode && canSelect ? 'cursor-pointer hover:shadow-lg' : ''
                  } ${
                    isSelected ? 'ring-2 ring-primary shadow-lg' : ''
                  }`}
                  onClick={() => {
                    if (bulkSelectMode && canSelect) {
                      toggleDatasetSelection(dataset.id);
                    }
                  }}
                >
                  {bulkSelectMode && canSelect && (
                    <div className="absolute top-4 left-4 z-10">
                      {isSelected ? (
                        <CheckSquare className="w-6 h-6 text-primary" />
                      ) : (
                        <Square className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  
                  {priceInfo.hasDiscount && (
                    <div className="absolute top-2 right-2 bg-accent text-background px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {priceInfo.discountPercent}% OFF
                    </div>
                  )}
                  
                  <div className={`flex items-start justify-between mb-4 ${bulkSelectMode && canSelect ? 'ml-8' : ''}`}>
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
                      <div className="flex flex-col items-end">
                        {priceInfo.hasDiscount ? (
                          <>
                            <span className="text-muted-foreground line-through text-xs">
                              {priceInfo.originalPrice} SUI
                            </span>
                            <span className="text-accent font-bold">
                              {priceInfo.finalPrice} SUI
                            </span>
                          </>
                        ) : (
                          <span className="text-accent font-bold">
                            {priceInfo.finalPrice} SUI
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!bulkSelectMode && (
                    <Button
                      disabled={buttonState.disabled}
                      variant={buttonState.variant}
                      className={`w-full font-bold py-3 ${
                        buttonState.disabled 
                          ? "opacity-50" 
                          : priceInfo.hasDiscount
                          ? "bg-gradient-to-r from-accent to-primary text-background"
                          : "bg-gradient-to-r from-primary to-secondary text-background"
                      }`}
                    >
                      <ShoppingCart className="w-5 h-5 mr-2" />
                      {buttonState.text}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <Card className="p-6 max-w-2xl w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-primary">Bulk Purchase Subscription</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={closePurchaseModal}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-6 mb-6">
              <div className="bg-secondary/20 p-4 rounded-lg border border-primary/20">
                <h4 className="font-bold text-primary text-lg mb-3">
                  Selected Datasets ({selectedDatasets.size})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Array.from(selectedDatasets).map(id => {
                    const dataset = datasets.find(d => d.id === id);
                    if (!dataset) return null;
                    const priceInfo = getPriceDisplay(dataset);
                    return (
                      <div key={id} className="flex items-center justify-between text-sm p-2 bg-background/50 rounded">
                        <span className="font-medium">
                          {dataset.language} - {dataset.dialect} ({dataset.durationLabel})
                        </span>
                        {priceInfo.hasDiscount && (
                          <span className="text-accent text-xs font-bold">
                            {priceInfo.discountPercent}% OFF
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

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
                      className="text-xs py-3 h-auto font-medium"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1 text-center">Total Price</p>
                
                {(() => {
                  const { totalOriginal, totalDiscount, totalFinal } = calculateBulkPrice();
                  return totalDiscount > 0 ? (
                    <>
                      <div className="text-center mb-2">
                        <p className="text-lg text-muted-foreground line-through">
                          {formatPrice(totalOriginal)} SUI
                        </p>
                        <p className="text-2xl font-bold text-accent">
                          {formatPrice(totalFinal)} SUI
                        </p>
                        <p className="text-xs text-accent font-bold mt-1">
                          Save {formatPrice(totalDiscount)} SUI (Creator Discount Applied)
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-2xl font-bold text-accent text-center mb-2">
                      {formatPrice(totalFinal)} SUI
                    </p>
                  );
                })()}
                
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{selectedDatasets.size} dataset(s)</span>
                  <span>×</span>
                  <span>{selectedDays} day(s)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={closePurchaseModal}
                className="flex-1 py-3 font-medium"
                disabled={purchasing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkPurchase}
                disabled={purchasing}
                className="flex-1 py-3 font-bold bg-gradient-to-r from-primary to-secondary text-background"
              >
                {purchasing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Confirm Bulk Purchase
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