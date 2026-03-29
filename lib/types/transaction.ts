export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  raw_text: string;
  created_at: string;
}
