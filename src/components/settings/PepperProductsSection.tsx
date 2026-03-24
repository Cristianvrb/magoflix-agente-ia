import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, Trash2, Loader2, Download, Search, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPepperProducts, createPepperProduct, updatePepperProduct, deletePepperProduct } from "@/lib/supabase-helpers";
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

export default function PepperProductsSection() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newOfferHash, setNewOfferHash] = useState("");
  const [newProductHash, setNewProductHash] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [pepperProducts, setPepperProducts] = useState<PepperProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: products = [], isLoading } = useQuery({
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
          (o) =>
            o.offer_name.toLowerCase().includes(term) ||
            product.product_name.toLowerCase().includes(term)
        ),
      }))
      .filter((p) => p.offers.length > 0 || p.product_name.toLowerCase().includes(term));
  }, [pepperProducts, searchTerm]);

  const createMutation = useMutation({
    mutationFn: (product: { name: string; offer_hash: string; product_hash: string; price_cents: number }) =>
      createPepperProduct(product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pepper-products"] });
      setNewName("");
      setNewOfferHash("");
      setNewProductHash("");
      setNewPrice("");
      toast.success("Produto adicionado!");
    },
    onError: () => toast.error("Erro ao adicionar produto"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updatePepperProduct(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pepper-products"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePepperProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pepper-products"] });
      toast.success("Produto removido!");
    },
  });

  const canAdd = newName && newOfferHash && newProductHash && newPrice && parseFloat(newPrice) > 0;

  async function handleImport() {
    setImportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pepper-sync");
      if (error) throw error;
      const prods: PepperProduct[] = data?.products || [];
      const filtered = prods.filter(p => p.product_name.toUpperCase().includes("LISTA SECRETA"));
      setPepperProducts(filtered);
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Produtos Pepper (PIX)</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImport}
              disabled={importLoading}
            >
              {importLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Importar da Pepper
            </Button>
          </div>
          <CardDescription>
            Cadastre seus produtos da Pepper para o agente gerar pagamentos PIX automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {(products as any[]).map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      R$ {(p.price_cents / 100).toFixed(2)} · {p.offer_hash.slice(0, 12)}...
                    </p>
                  </div>
                  <Switch
                    checked={p.active}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: p.id, active: checked })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(p.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}

              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <p className="text-sm font-medium">Adicionar Produto Manualmente</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome do Produto</Label>
                    <Input
                      placeholder="Ex: Plano Pro"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preço (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="19.90"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Offer Hash</Label>
                    <Input
                      placeholder="Hash da oferta na Pepper"
                      value={newOfferHash}
                      onChange={(e) => setNewOfferHash(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Product Hash</Label>
                    <Input
                      placeholder="Hash do produto na Pepper"
                      value={newProductHash}
                      onChange={(e) => setNewProductHash(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => createMutation.mutate({
                    name: newName,
                    offer_hash: newOfferHash,
                    product_hash: newProductHash,
                    price_cents: Math.round(parseFloat(newPrice) * 100),
                  })}
                  disabled={!canAdd || createMutation.isPending}
                  size="sm"
                  className="w-full"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Adicionar Produto
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Produtos da Pepper</DialogTitle>
            <DialogDescription>
              Selecione as ofertas que deseja importar. Os campos serão preenchidos automaticamente.
            </DialogDescription>
          </DialogHeader>
          {pepperProducts.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto ou oferta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
          <div className="space-y-4">
            {pepperProducts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum produto encontrado.
              </p>
            )}
            {filteredPepperProducts.length === 0 && pepperProducts.length > 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum resultado para "{searchTerm}"
              </p>
            )}
            {filteredPepperProducts.map((product) => (
              <div key={product.product_hash} className="space-y-2">
                <p className="text-sm font-semibold">{product.product_name}</p>
                {product.offers.length === 0 && (
                  <p className="text-xs text-muted-foreground ml-2">Sem ofertas</p>
                )}
                {product.offers.map((offer) => {
                  const alreadyImported = existingHashes.has(offer.offer_hash);
                  return (
                    <div
                      key={offer.offer_hash}
                      className={`flex items-center justify-between rounded-lg border p-3 ml-2 transition-colors ${alreadyImported ? "opacity-60 bg-muted/30" : "hover:bg-accent/50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-sm font-medium">{offer.offer_name}</p>
                          <p className="text-xs text-muted-foreground">
                            R$ {(offer.price_cents / 100).toFixed(2)} · {offer.offer_hash.slice(0, 16)}...
                          </p>
                        </div>
                      </div>
                      {alreadyImported ? (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" />
                          Já importado
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelectOffer(product, offer)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Importar
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
    </>
  );
}
