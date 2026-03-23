import SplitProgressView from "./progress/ProgressView";

type ProgressViewProps = {
  userId: string | null;
  dayDate: string;
  setDayDate: (v: string) => void;
};

export default function ProgressView(props: ProgressViewProps) {
  return <SplitProgressView {...props} />;
}





































