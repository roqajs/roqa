import type { ComponentIR } from "roqa/ir";

export interface RoqaFrontend {
	handles(id: string): boolean;
	toMIR(code: string, id: string): ComponentIR | ComponentIR[];
}

export default function jsx(): RoqaFrontend;
