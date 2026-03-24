import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPepperTransactions, syncPepperTransactions } from "@/lib/supabase-helpers";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  approved: "bg-green-500/10 text-green-600 border-green-200",
  paid: "bg-green-500/10 text-green-600 border-green-200",
  completed: "bg-green-500/10 text-green-600 border-green-200",
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  waiting_payment: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  refunded: "bg-red-500/10 text-red-600 border-red-200",
  cancelled: "bg-muted text-muted-foreground",
  chargeback: "bg-red-500/10 text-red-600 border-red-200",
};

const statusLabels: Record<string, string> = {
  approved: "Aprovado",
  paid: "Pago",
  completed: "Completo",
  pending: "Pendente",
  waiting_payment: "Aguardando",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
  chargeback: "Chargeback",
};

export default function PepperTransactionsTab() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["pepper-transactions"],
    queryFn: getPepperTransactions,
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const rows = await syncPepperTransactions();
      queryClient.invalidateQueries({ queryKey: ["pepper-transactions"] });
      toast.success(`${rows.length} transações sincronizadas!`);
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Erro ao sincronizar: " + (err.message || ""));
    } finally {
      setSyncing(false);
    }
  }

  const txList = transactions as any[];
  const totalApproved = txList
    .filter((t) => ["approved", "paid", "completed"].includes(t.payment_status))
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  const totalLiquid = txList
    .filter((t) => ["approved", "paid", "completed"].includes(t.payment_status))
    .reduce((sum, t) => sum + (t.amount_liquid || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Transações Pepper</CardTitle>
              <CardDescription>Histórico de vendas sincronizado da Pepper</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Sincronizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {txList.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Vendas</p>
                <p className="text-xl font-bold">{txList.filter((t) => ["approved", "paid", "completed"].includes(t.payment_status)).length}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Receita Bruta</p>
                <p className="text-xl font-bold">R$ {(totalApproved / 100).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Receita Líquida</p>
                <p className="text-xl font-bold text-green-600">R$ {(totalLiquid / 100).toFixed(2)}</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : txList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma transação sincronizada. Clique em "Sincronizar" para buscar da Pepper.
            </p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txList.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <p className="font-medium text-sm truncate max-w-[150px]">{tx.product_name || tx.offer_name || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">{tx.offer_name}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm truncate max-w-[120px]">{tx.customer_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{tx.customer_phone || tx.customer_email || ""}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">R$ {(tx.amount / 100).toFixed(2)}</p>
                        {tx.amount_liquid > 0 && tx.amount_liquid !== tx.amount && (
                          <p className="text-xs text-green-600">líq. R$ {(tx.amount_liquid / 100).toFixed(2)}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[tx.payment_status] || ""}>
                          {statusLabels[tx.payment_status] || tx.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tx.pepper_created_at
                          ? new Date(tx.pepper_created_at).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
