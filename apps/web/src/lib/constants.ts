export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit Card",
  CASH: "Cash",
  INVESTMENT: "Investment",
  LOAN: "Loan / Debt",
  OTHER_ASSET: "Other Asset",
  OTHER_LIABILITY: "Other Liability",
};

export const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as (keyof typeof ACCOUNT_TYPE_LABELS)[];

export const ASSET_ACCOUNT_TYPES = new Set(["CHECKING", "SAVINGS", "CASH", "INVESTMENT", "OTHER_ASSET"]);
export const LIABILITY_ACCOUNT_TYPES = new Set(["CREDIT_CARD", "LOAN", "OTHER_LIABILITY"]);

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
  TRANSFER: "Transfer",
  REFUND: "Refund",
  CREDIT_CARD_PAYMENT: "Credit Card Payment",
};

export const CLEARED_STATUS_LABELS: Record<string, string> = {
  UNCLEARED: "Uncleared",
  CLEARED: "Cleared",
  RECONCILED: "Reconciled",
};
