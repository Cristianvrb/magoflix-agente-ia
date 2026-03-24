import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Search, Check, Plus, Tag } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPepperProducts, createPepperProduct, pepperCreateOffer } from "@/lib/supabase-helpers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PepperOffer {
  offer_hash: string;
  offer_name: string;
  price_cents: number;
}

interface PepperProduct {
  product_hash: string;
  product_name: string;
  offers: PepperOffer[];
}

export default function PepperOfferManager() {
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [pepperProducts, setPepperProducts] = useState<PepperProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // New offer creation
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerProductHash, setOfferProductHash] = useState("");
  const [offerProductName, setOfferProductName] = useState("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerCreating, setOfferCreating] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["pepper-products"],
    queryFn: getPepperProducts,
  });

  const existingHashes = useMemo(
    () => new Set((products as any[]).map((p: any) => p.offer_hash)),
    [products]
  );

  const filteredPepperProducts = useMemo(() => {
    if (!searchTerm.trim()) return pepperProducts;
    const term = searchTerm.toLowerCase();
    return pepperProducts
      .map((product) => ({
        ...product,
        offers: product.offers.filter(
          (o) => o.offer_name.toLowerCase().includes(term) || product.product_name.toLowerCase().includes(term)
        ),
      }))
      .filter((p) => p.offers.length > 0 || p.product_name.toLowerCase().includes(term));
  }, [pepperProducts, searchTerm]);

  async function handleImport() {
    setImportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pepper-sync", {
        body: { action: "list_products" },
      });
      if (error) throw error;
      const prods: PepperProduct[] = data?.products || [];
      setPepperProducts(prods);
      setImportOpen(true);
      if (prods.length === 0) {
        toast.info("Nenhum produto encontrado na sua conta Pepper");
      }
    } catch (err: any) {
      console.error("Import error:", err);
      toast.error("Erro ao buscar produtos da Pepper: " + (err.message || ""));
    } finally {
      setImportLoading(false);
    }
  }

  async function handleSelectOffer(product: PepperProduct, offer: PepperOffer) {
    if (existingHashes.has(offer.offer_hash)) {
      toast.info("Esta oferta já foi importada");
      return;
    }
    try {
      await createPepperProduct({
        name: offer.offer_name || product.product_name,
        offer_hash: offer.offer_hash,
        product_hash: product.product_hash,
        price_cents: offer.price_cents,
      });
      queryClient.invalidateQueries({ queryKey: ["pepper-products"] });
      toast.success(`"${offer.offer_name || product.product_name}" importado!`);
    } catch {
      toast.error("Erro ao importar oferta");
    }
  }

  function openCreateOffer(productHash: string, productName: string) {
    setOfferProductHash(productHash);
    setOfferProductName(productName);
    setOfferTitle("");
    setOfferPrice("");
    setOfferOpen(true);
  }

  async function handleCreateOffer() {
    if (!offerTitle || !offerPrice || !offerProductHash) return;
    setOfferCreating(true);
    try {
      const resp = await pepperCreateOffer({
        product_hash: offerProductHash,
        title: offerTitle,
        price: Math.round(parseFloat(offerPrice) * 100),
      });
      toast.success("Oferta criada na Pepper!");
      setOfferOpen(false);
      // Re-import to refresh
      handleImport();
    } catch (err: any) {
      toast.error("Erro ao criar oferta: " + (err?.message || JSON.stringify(err)));
    } finally {
      setOfferCreating(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Produtos & Ofertas</CardTitle>
              <CardDescription>Importe produtos ou crie ofertas com preços especiais para upsell</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleImport} disabled={importLoading}>
              {importLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Importar da Pepper
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Produtos da Pepper</DialogTitle>
            <DialogDescription>Importe ofertas existentes ou crie novas com preço especial para upsell.</DialogDescription>
          </DialogHeader>
          {pepperProducts.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          )}
          <div className="space-y-4">
            {pepperProducts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto encontrado.</p>
            )}
            {filteredPepperProducts.map((product) => (
              <div key={product.product_hash} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{product.product_name}</p>
                  <Button size="sm" variant="ghost" onClick={() => openCreateOffer(product.product_hash, product.product_name)}>
                    <Tag className="mr-1 h-3 w-3" />
                    Nova Oferta
                  </Button>
                </div>
                {product.offers.map((offer) => {
                  const alreadyImported = existingHashes.has(offer.offer_hash);
                  return (
                    <div
                      key={offer.offer_hash}
                      className={`flex items-center justify-between rounded-lg border p-3 ml-2 transition-colors ${alreadyImported ? "opacity-60 bg-muted/30" : "hover:bg-accent/50"}`}
                    >
                      <div>
                        <p className="text-sm font-medium">{offer.offer_name}</p>
                        <p className="text-xs text-muted-foreground">
                          R$ {(offer.price_cents / 100).toFixed(2)} · {offer.offer_hash.slice(0, 16)}...
                        </p>
                      </div>
                      {alreadyImported ? (
                        <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" />Importado</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleSelectOffer(product, offer)}>
                          <Plus className="mr-1 h-3 w-3" />Importar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Offer Dialog */}
      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Oferta — {offerProductName}</DialogTitle>
            <DialogDescription>Crie uma oferta com preço especial (ex: desconto para upsell pós-compra)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título da Oferta</Label>
              <Input placeholder="Ex: Upsell Kit Revendedor -20%" value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Preço (R$)</Label>
              <Input type="number" step="0.01" placeholder="39.90" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} />
            </div>
            <Button onClick={handleCreateOffer} disabled={offerCreating || !offerTitle || !offerPrice} className="w-full">
              {offerCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tag className="mr-2 h-4 w-4" />}
              Criar Oferta na Pepper
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
