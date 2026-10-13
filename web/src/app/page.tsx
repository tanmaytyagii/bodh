import { Conversation } from "@/components/ask/Conversation";
import { LandingStory } from "@/components/landing/Story";

export default function AskPage() {
  return <Conversation below={<LandingStory />} />;
}
