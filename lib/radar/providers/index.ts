import { labourMarketProvider } from "@/lib/radar/providers/labour-market";
import { newsProvider } from "@/lib/radar/providers/news";
import { regionalProvider } from "@/lib/radar/providers/regional";
import { trendsProvider } from "@/lib/radar/providers/trends";
import type { SignalProvider } from "@/lib/radar/types";

/** The whole registry Radar scans -- add a new provider here to extend coverage (section 2/14: this is the plug-in point new signal sources or a new company's sources hang off). */
export const SIGNAL_PROVIDERS: SignalProvider[] = [newsProvider, regionalProvider, labourMarketProvider, trendsProvider];
