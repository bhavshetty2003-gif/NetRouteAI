import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import CustomNode from "../CustomNode/CustomNode";
import routerData from "../../data/routerData";

type NetworkGraphProps = {
  aiEnabled: boolean;
  setSelectedRouter: React.Dispatch<
    React.SetStateAction<keyof typeof routerData>
  >;
};

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const nodes: Node[] = [
  {
    id: "1",
    type: "custom",
    position: { x: 350, y: 40 },
    data: { label: "Router R1" },
  },
  {
    id: "2",
    type: "custom",
    position: { x: 120, y: 220 },
    data: { label: "Router R2" },
  },
  {
    id: "3",
    type: "custom",
    position: { x: 580, y: 220 },
    data: { label: "Router R3" },
  },
  {
    id: "4",
    type: "custom",
    position: { x: 350, y: 420 },
    data: { label: "PC1" },
  },
];

function NetworkGraph({
  aiEnabled,
  setSelectedRouter,
}: NetworkGraphProps) {
  const edges: Edge[] = [
    {
      id: "e1-2",
      source: "1",
      target: "2",
      animated: true,
      style: {
        stroke: aiEnabled ? "#475569" : "#22c55e",
        strokeWidth: 3,
      },
    },
    {
      id: "e2-4",
      source: "2",
      target: "4",
      animated: true,
      style: {
        stroke: aiEnabled ? "#475569" : "#22c55e",
        strokeWidth: 3,
      },
    },
    {
      id: "e1-3",
      source: "1",
      target: "3",
      animated: true,
      style: {
        stroke: aiEnabled ? "#06b6d4" : "#64748b",
        strokeWidth: 3,
      },
    },
    {
      id: "e3-4",
      source: "3",
      target: "4",
      animated: true,
      style: {
        stroke: aiEnabled ? "#06b6d4" : "#64748b",
        strokeWidth: 3,
      },
    },
  ];

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const label = (node.data as { label: string }).label;

          if (label.startsWith("Router")) {
            setSelectedRouter(label as keyof typeof routerData);
          }
        }}
      >
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}

export default NetworkGraph;