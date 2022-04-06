/* eslint-disable import/extensions */
/* eslint-disable react/prop-types */
import {
  Box, useColorModeValue,
} from '@chakra-ui/react';
import { ipcRenderer } from 'electron';
import log from 'electron-log';
// import PillPity from 'pill-pity';
import React, {
  createContext, memo, useCallback, useContext, useEffect, useMemo,
} from 'react';
import ReactFlow, {
  Background, Controls, useEdgesState, useNodesState, useReactFlow,
} from 'react-flow-renderer';
import { GlobalContext } from '../helpers/contexts/GlobalNodeState.jsx';
import { SettingsContext } from '../helpers/contexts/SettingsContext.jsx';

export const NodeDataContext = createContext({});

const STARTING_Z_INDEX = 50;

// eslint-disable-next-line react/prop-types
const ReactFlowBox = ({
  wrapperRef, nodeTypes, edgeTypes,
}) => {
  const {
    availableNodes, createUniqueId, createConnection,
    onMoveEnd, zoom, getInputDefaults,
    useMenuCloseFunctions, useHoveredNode,
  } = useContext(GlobalContext);

  const {
    useSnapToGrid,
  } = useContext(SettingsContext);

  const {
    project, getNode, setViewport,
  } = useReactFlow();

  // const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const sortNodesAndEdges = useCallback(() => {
    const iterators = nodes.filter((n) => n.type === 'iterator'); // .sort((i) => (i.selected ? 1 : -1));
    let sortedNodes = [];

    // Sort the nodes in a way that makes iterators stack on each other correctly
    // Put iterators below their children
    iterators.forEach((_iterator, index) => {
      const iterator = _iterator;
      iterator.zIndex = STARTING_Z_INDEX + (index * 5);
      sortedNodes.push(iterator);
      const children = nodes.filter((n) => n.parentNode === iterator.id);
      // sorted.concat(children);
      children.forEach((_child) => {
        const child = _child;
        child.zIndex = STARTING_Z_INDEX + (index * 5) + 1;
        // child.position.x = Math.min(Math.max(child.position.x, 0), iterator.width);
        // child.position.y = Math.min(Math.max(child.position.y, 0), iterator.height);
        sortedNodes.push(child);
      });
    });

    // Put nodes not in iterators on top of the iterators
    const freeNodes = nodes.filter((n) => n.type !== 'iterator' && !n.parentNode);
    freeNodes.forEach((f) => {
      sortedNodes.push(f);
    });

    const indexedEdges = edges.map((e) => {
      const index = (sortedNodes.find((n) => n.id === e.target)?.zIndex || 1000);
      return ({ ...e, zIndex: index });
    });

    // This fixes the connection line being behind iterators if no edges are present
    if (indexedEdges.length === 0) {
      sortedNodes = sortedNodes.map((n) => ({ ...n, zIndex: -1 }));
    }

    setNodes(sortedNodes);
    setEdges(indexedEdges);
  }, [nodes, edges, setNodes, setEdges]);

  useEffect(() => {
    if (edges.length > 0) {
      sortNodesAndEdges();
    }
  }, [nodes.length, edges.length]);

  const onNodeDragStop = useCallback(() => {
    sortNodesAndEdges();
  }, [nodes, edges, setNodes, setEdges]);

  const onNodesDelete = useCallback((_nodesToDelete) => {
    // Prevent iterator helpers from being deleted
    const iteratorsToDelete = _nodesToDelete.filter((n) => n.type === 'iterator').map((n) => n.id);
    const nodesToDelete = _nodesToDelete.filter((n) => !(n.type === 'iteratorHelper' && !iteratorsToDelete.includes(n.parentNode)));

    const nodeIds = nodesToDelete.map((n) => n.id);
    const newNodes = nodes.filter((n) => !nodeIds.includes(n.id));
    setNodes(newNodes);
  }, [setNodes, nodes]);

  const onEdgesDelete = useCallback((edgesToDelete) => {
    const edgeIds = edgesToDelete.map((e) => e.id);
    const newEdges = edges.filter((e) => !edgeIds.includes(e.id));
    setEdges(newEdges);
  }, [setEdges, edges]);

  const memoNodeTypes = useMemo(() => (nodeTypes), []);
  const memoEdgeTypes = useMemo(() => (edgeTypes), []);

  const [isSnapToGrid, , snapToGridAmount] = useSnapToGrid;

  const alignNodes = useCallback(() => {
    if (isSnapToGrid) {
      const alignedNodes = nodes.map((n) => {
        if (n.parentNode) {
          return n;
        }
        return {
          ...n,
          position: {
            x: n.position.x - (n.position.x % snapToGridAmount),
            y: n.position.y - (n.position.y % snapToGridAmount),
          },
        };
      });
      setNodes(alignedNodes);
    }
  }, [nodes, snapToGridAmount, isSnapToGrid]);

  useEffect(() => {
    alignNodes();
  }, [snapToGridAmount]);

  // const onInit = useCallback(
  //   (rfi) => {
  //     if (!reactFlowInstance) {
  //       setReactFlowInstance(rfi);
  //       console.log('flow loaded:', rfi);
  //     }
  //   },
  //   [reactFlowInstance],
  // );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const [hoveredNode, setHoveredNode] = useHoveredNode;

  const onDragStart = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const createNode = useCallback(({
    position, data, nodeType, defaultNodes = [], parent = null,
  }) => {
    console.log('🚀 ~ file: GlobalNodeState.jsx ~ line 294 ~ position', position);
    const id = createUniqueId();
    const newNode = {
      type: nodeType,
      id,
      // This looks stupid, but the child position was overwriting the parent's because shallow copy
      position: {
        x: position.x - (position.x % snapToGridAmount),
        y: position.y - (position.y % snapToGridAmount),
      },
      data: { ...data, id, inputData: (data.inputData ? data.inputData : getInputDefaults(data)) },
    };
    if (parent || (hoveredNode && nodeType !== 'iterator')) {
      let parentNode;
      if (typeof parent === 'string' || parent instanceof String) {
        parentNode = getNode(parent);
        // eslint-disable-next-line no-param-reassign
        parent = null; // This is so it actually set the nodes
      } else if (parent) {
        parentNode = parent;
      } else {
        parentNode = getNode(hoveredNode);
      }
      if (parentNode && parentNode.type === 'iterator' && newNode.type !== 'iterator') {
        const {
          width, height, offsetTop, offsetLeft,
        } = parentNode.data.iteratorSize ? parentNode.data.iteratorSize : {
          width: 480, height: 480, offsetTop: 0, offsetLeft: 0,
        };
        newNode.position.x = position.x - parentNode.position.x;
        newNode.position.y = position.y - parentNode.position.y;
        newNode.parentNode = parentNode?.id || hoveredNode;
        newNode.data.parentNode = parentNode?.id || hoveredNode;
        newNode.extent = [[offsetLeft, offsetTop], [width, height]];
      }
    }
    const extraNodes = [];
    if (nodeType === 'iterator') {
      newNode.data.iteratorSize = {
        width: 480, height: 480, offsetTop: 0, offsetLeft: 0,
      };
      defaultNodes.forEach(({ category, name }) => {
        const subNodeData = availableNodes[category][name];
        const subNode = createNode({
          nodeType: subNodeData.nodeType,
          position: newNode.position,
          data: {
            category,
            type: name,
            subcategory: subNodeData.subcategory,
            icon: subNodeData.icon,
          },
          parent: newNode,
        });
        extraNodes.push(subNode);
      });
    }
    if (!parent) {
      setNodes([
        ...nodes,
        newNode,
        ...extraNodes,
      ]);
    }
    return newNode;
  }, [nodes, getNode, setNodes, availableNodes, hoveredNode, getInputDefaults]);

  const onDrop = useCallback((event) => {
    // log.info('dropped');
    event.preventDefault();

    const reactFlowBounds = wrapperRef.current.getBoundingClientRect();

    try {
      const type = event.dataTransfer.getData('application/reactflow/type');
      const nodeType = event.dataTransfer.getData('application/reactflow/nodeType');
      // const inputs = JSON.parse(event.dataTransfer.getData('application/reactflow/inputs'));
      // const outputs = JSON.parse(event.dataTransfer.getData('application/reactflow/outputs'));
      const category = event.dataTransfer.getData('application/reactflow/category');
      const icon = event.dataTransfer.getData('application/reactflow/icon');
      const subcategory = event.dataTransfer.getData('application/reactflow/subcategory');
      const offsetX = event.dataTransfer.getData('application/reactflow/offsetX');
      const offsetY = event.dataTransfer.getData('application/reactflow/offsetY');
      const defaultNodes = nodeType === 'iterator' ? JSON.parse(event.dataTransfer.getData('application/reactflow/defaultNodes')) : null;
      // log.info(type, inputs, outputs, category);

      const position = project({
        x: event.clientX - reactFlowBounds.left - (offsetX * zoom),
        y: event.clientY - reactFlowBounds.top - (offsetY * zoom),
      });

      const nodeData = {
        category,
        type,
        icon,
        subcategory,
      };

      createNode({
        type, position, data: nodeData, nodeType, defaultNodes,
      });
    } catch (error) {
      log.error(error);
      console.log('Oops! This probably means something was dragged here that should not have been.');
    }
  }, [createNode, wrapperRef.current, zoom]);

  const onNodeContextMenu = useCallback((event, node) => {
    console.log(event, node);
  }, []);

  const [closeAllMenus] = useMenuCloseFunctions;

  // const onConnect = useCallback(
  //   (params) => {
  //     createConnection(params);
  //   }, [],
  // );

  // const CtrlNPressed = useKeyPress(['Meta+n', 'Strg+n', 'Ctrl+n']);
  // console.log('🚀 ~ file: ReactFlowBox.jsx ~ line 281 ~ CtrlNPressed', CtrlNPressed);
  // useEffect(() => {
  //   console.log(CtrlNPressed);
  //   if (CtrlNPressed) {
  //     console.log('attempting to clear');
  //     setNodes([]);
  //     setEdges([]);
  //   }
  // }, [CtrlNPressed]);

  const clearState = () => {
    console.log('clearing state???', nodes, edges);
    setEdges([]);
    setNodes([]);
    // setSavePath(undefined);
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  useEffect(() => {
    ipcRenderer.on('file-new', () => {
      clearState();
    });
    return () => {
      ipcRenderer.removeAllListeners('file-new');
    };
  }, [nodes.length, setNodes, setEdges]);

  return (
    <Box w="100%" h="100%" borderWidth="1px" borderRadius="lg" ref={wrapperRef} bg={useColorModeValue('gray.100', 'gray.800')}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgesDelete={onEdgesDelete}
        onNodesDelete={onNodesDelete}
        onConnect={createConnection}
        // onInit={onInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragStart={onDragStart}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={memoNodeTypes}
        edgeTypes={memoEdgeTypes}
        onNodeContextMenu={onNodeContextMenu}
        style={{
          zIndex: 0,
          borderRadius: '0.5rem',
        }}
        // onSelectionChange={setSelectedElements}
        maxZoom={8}
        minZoom={0.125}
        snapToGrid={isSnapToGrid}
        snapGrid={useMemo(() => [snapToGridAmount, snapToGridAmount], [snapToGridAmount])}
        // fitView
        // fitViewOptions={{
        //   minZoom: 1,
        //   maxZoom: 1,
        //   padding: 40,
        // }}
        // onlyRenderVisibleElements
        deleteKeyCode={useMemo(() => ['Backspace', 'Delete'], [])}
        onMoveEnd={onMoveEnd}
        onPaneClick={closeAllMenus}
      >
        <Background
          variant="dots"
          gap={16}
          size={0.5}
        />
        {/* Would be cool to use this in the future */}
        {/* <PillPity
          pattern="topography"
          as={Background}
          align="center"
          justify="center"
          fontWeight="bold"
          boxSize="200px"
          patternFill={useColorModeValue('brand.200', 'brand.300')}
          bgColor="choc.secondary"
          patternOpacity={0.3}
        /> */}

        <Controls />
      </ReactFlow>
    </Box>
  );
};

export default memo(ReactFlowBox);
