export type TermsScreenProps<T> = {
  value: T;
  onChange: (value: T) => void;
  onNext: () => void;
  onBack?: () => void;
};
