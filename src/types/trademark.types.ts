export interface TrademarkMessage {
  uid: string;
  name: string;
  product_name: string;
  imageUrl: string;
}

export interface TrademarkResults {
  find_same_name: {
    result: boolean;
    msg: string;
  };
  find_similar_name: {
    result: boolean;
    data?: Array<[string, string, string | null]>; 
    msg?: string;
  };
  find_similar_pronun: {
    result: boolean;
    data?: Array<[string, number, string, string | null]>;
    msg?: string;
  };
  tokenize: {
    tokens: string[];
  };
  check_elastic: {
    result: boolean;
    NegativeTokens: Array<{
      name: string;
      positive: number;
      negative: number;
    }>;
  };
  similarity_score: number;
}
