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
    data?: Array<[string, string, string | null]>; // [similar_title, application_date, image_url]
    msg?: string;
  };
  find_similar_pronun: {
    result: boolean;
    data?: Array<[string, number, string, string | null]>; // [title, score, application_date, image_url]
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
