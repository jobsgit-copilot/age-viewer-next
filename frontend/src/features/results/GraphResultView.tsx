/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Graph result view — port of the old
 * `CypherResultCytoscape` + `CypherResultCytoscapeChart` + Legend + Footer.
 *
 * - Legend badges per node/edge label (palette colors), clickable to edit
 *   color / size / caption (old footer "labels" mode, now sticky).
 * - Footer: hovered/selected element details or node/edge counts, layout
 *   selector, caption selector (inside the label editor), refresh
 *   (re-runs the layout), PNG download, filter popover + filter tags.
 * - Context menu (cxtmenu) on nodes: reset position / Expand / Hide /
 *   Delete / Lock / Filter / Unfilter; on edges: Hide / Delete / Lock.
 *
 * No client-side SQL anywhere: Expand and Delete go through the v2-only
 * `getNeighbors` / `deleteElement` RTK Query mutations (contract §10).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App as AntdApp, Button, Input, Popover, Select, Space, Tag, Tooltip } from 'antd';
import {
  CameraOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  EyeInvisibleOutlined,
  FilterOutlined,
  LockOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { saveAs } from 'file-saver';
import type cytoscape from 'cytoscape';
import { uid } from '../../app/id';
import { useAppSelector } from '../../app/hooks';
import type { ApiError, CypherResult } from '../../types';
import {
  formatApiError,
  useDeleteElementMutation,
  useGetMetaDataMutation,
  useGetNeighborsMutation,
} from '../api/apiSlice';
import { processMetadataResponse, setMetaData } from '../database/metadataSlice';
import { useAppDispatch } from '../../app/hooks';
import CytoscapeCanvas from './CytoscapeCanvas';
import { runLayout } from './useCytoscape';
import {
  defaultRegistry,
  edgeLabelColors,
  edgeLabelSizes,
  generateCytoscapeElement,
  mergeLegends,
  nodeLabelColors,
  nodeLabelSizes,
} from './cytoscapeUtils';
import type {
  CyElementDefinition,
  GraphElementData,
  GraphLegend,
  LabelColor,
  LabelStyleRegistry,
  LegendEntry,
} from './cytoscapeUtils';
import { defaultLayoutName, initialPositions, layoutDisplayNames } from './cytoscapeLayouts';
import type { LayoutName } from './cytoscapeLayouts';
import styles from './GraphResultView.module.css';

const FILTERED_CLASS = 'g-filtered';

export interface GraphFilter {
  key: string;
  label: string;
  property: string;
  keyword: string;
}

export interface GraphResultViewProps {
  /** Successful cypher result carrying graph elements. */
  result: CypherResult;
  /** Target graph for Expand/Delete; defaults to the connected graph. */
  graph?: string;
  /** Row cap for the initial conversion (0 = unlimited). */
  maxDataOfGraph?: number;
  /** Base filename for the PNG download. */
  exportName?: string;
  /** Style source; defaults to the shared session-wide registry. */
  registry?: LabelStyleRegistry;
  className?: string;
}

/** Port of the old applyFilterOnCytoscapeElements (dim, don't hide). */
function applyGraphFilters(cy: cytoscape.Core, filters: GraphFilter[]): void {
  cy.elements(`.${FILTERED_CLASS}`).style('opacity', 1).removeClass(FILTERED_CLASS);
  const active = filters.filter((f) => f.keyword !== '');
  if (active.length === 0) return;
  cy.nodes().forEach((node) => {
    const data = node.data() as GraphElementData;
    const match = active.some(
      (f) =>
        f.label === data.label &&
        String(data.properties?.[f.property] ?? '').includes(f.keyword),
    );
    if (!match) node.addClass(FILTERED_CLASS);
  });
  cy.edges().forEach((edge) => {
    if (edge.source().hasClass(FILTERED_CLASS) || edge.target().hasClass(FILTERED_CLASS)) {
      edge.addClass(FILTERED_CLASS);
    }
  });
  cy.elements(`.${FILTERED_CLASS}`).style('opacity', 0.1);
}

/**
 * lock()/unlock() are typed node-only in cytoscape's bundled types but
 * work on edges at runtime — hence the cast.
 */
function toggleLock(ele: cytoscape.SingularElementArgument): void {
  const lockable = ele as cytoscape.SingularElementArgument & {
    locked(): boolean;
    lock(): void;
    unlock(): void;
  };
  if (lockable.locked()) lockable.unlock();
  else lockable.lock();
}

function propertyKeysOf(elements: CyElementDefinition[], label: string): string[] {
  const keys = new Set<string>();
  elements.forEach((el) => {
    if (el.data.label === label) {
      Object.keys(el.data.properties ?? {}).forEach((k) => keys.add(k));
    }
  });
  return Array.from(keys).sort();
}

/** Footer line for a hovered/selected element (old extractData). */
function ElementDetails({ data }: { data: GraphElementData }) {
  return (
    <span className={styles.elementDetails}>
      <Tag color={data.backgroundColor} style={{ color: data.fontColor }}>
        {data.label}
      </Tag>
      <span>
        <strong>&lt;gid&gt; : </strong>
        {data.id}
      </span>
      {Object.entries(data.properties ?? {}).map(([key, value]) => (
        <span key={key}>
          <strong>{key} : </strong>
          {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
        </span>
      ))}
    </span>
  );
}

interface LabelEditorProps {
  type: 'node' | 'edge';
  label: string;
  entry: LegendEntry;
  captionOptions: string[];
  onColor: (color: LabelColor) => void;
  onSize: (size: number) => void;
  onCaption: (caption: string) => void;
}

/** Color swatches + size buttons + caption select (old footer label mode). */
function LabelEditor({
  type,
  label,
  entry,
  captionOptions,
  onColor,
  onSize,
  onCaption,
}: LabelEditorProps) {
  const palette = type === 'node' ? nodeLabelColors : edgeLabelColors;
  const sizes = type === 'node' ? nodeLabelSizes : edgeLabelSizes;
  return (
    <Space size={8} wrap>
      <Tag color={entry.color} style={{ color: entry.fontColor, marginInlineEnd: 0 }}>
        {label}
      </Tag>
      <span>
        Color :{' '}
        {palette.map((c) => (
          <button
            key={c.color}
            type="button"
            aria-label={`color ${c.color}`}
            className={`${styles.swatch} ${entry.color === c.color ? styles.swatchSelected : ''}`}
            style={{ backgroundColor: c.color }}
            onClick={() => onColor(c)}
          />
        ))}
      </span>
      <span>
        Size :{' '}
        {sizes.map((size) => (
          <Button
            key={size}
            size="small"
            type={entry.size === size ? 'primary' : 'default'}
            onClick={() => onSize(size)}
          >
            {size}
          </Button>
        ))}
      </span>
      <span>
        Caption :{' '}
        <Select
          size="small"
          style={{ minWidth: 120 }}
          value={entry.caption}
          onChange={onCaption}
          options={[
            ...captionOptions.map((c) => ({ value: c, label: `< ${c} >` })),
            { value: '', label: '< none >' },
          ]}
        />
      </span>
    </Space>
  );
}

interface FilterFormProps {
  legend: GraphLegend;
  elements: CyElementDefinition[];
  onAdd: (filter: GraphFilter) => void;
}

/** Add-filter popover content (small-scale old GraphFilterModal). */
function FilterForm({ legend, elements, onAdd }: FilterFormProps) {
  const labelOptions = useMemo(
    () => [
      ...Object.keys(legend.nodeLegend).map((l) => ({ value: `node:${l}`, label: `[N] ${l}` })),
      ...Object.keys(legend.edgeLegend).map((l) => ({ value: `edge:${l}`, label: `[E] ${l}` })),
    ],
    [legend],
  );
  const [target, setTarget] = useState<string>();
  const [property, setProperty] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const label = target?.slice(target.indexOf(':') + 1);
  const propertyOptions = useMemo(
    () => (label ? propertyKeysOf(elements, label) : []),
    [elements, label],
  );
  return (
    <Space direction="vertical" style={{ width: 240 }}>
      <Select
        placeholder="Label"
        style={{ width: '100%' }}
        value={target}
        options={labelOptions}
        onChange={(value) => {
          setTarget(value);
          setProperty(undefined);
        }}
      />
      <Select
        placeholder="Property"
        style={{ width: '100%' }}
        value={property}
        options={propertyOptions.map((p) => ({ value: p, label: p }))}
        onChange={setProperty}
      />
      <Input
        placeholder="Keyword"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <Button
        type="primary"
        block
        disabled={!label || !property}
        onClick={() => {
          if (!label || !property) return;
          onAdd({ key: uid(), label, property, keyword });
          setKeyword('');
        }}
      >
        Add filter
      </Button>
    </Space>
  );
}

function GraphResultViewInner({
  result,
  graph: graphProp,
  maxDataOfGraph: maxProp,
  exportName = 'graph',
  registry = defaultRegistry,
  className,
}: GraphResultViewProps) {
  const dispatch = useAppDispatch();
  const { message, modal } = AntdApp.useApp();
  const storeGraph = useAppSelector((s) => s.database.graph ?? s.metadata.currentGraph);
  const settingMax = useAppSelector((s) => s.setting.maxDataOfGraph);
  const graph = graphProp ?? storeGraph ?? '';
  const maxDataOfGraph = maxProp ?? settingMax;

  const [getNeighbors] = useGetNeighborsMutation();
  const [deleteElement] = useDeleteElementMutation();
  const [getMetaData] = useGetMetaDataMutation();

  const initial = useMemo(
    () => generateCytoscapeElement(result.rows, { maxDataOfGraph, registry }),
    [result, maxDataOfGraph, registry],
  );

  const [elements, setElements] = useState<CyElementDefinition[]>(() => [
    ...initial.elements.nodes,
    ...initial.elements.edges,
  ]);
  const [legend, setLegend] = useState<GraphLegend>(initial.legend);
  const [layoutName, setLayoutName] = useState<LayoutName>(defaultLayoutName);
  const [cy, setCy] = useState<cytoscape.Core | null>(null);
  const [hoverInfo, setHoverInfo] = useState<GraphElementData | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<{ type: 'node' | 'edge'; label: string } | null>(null);
  const [filters, setFilters] = useState<GraphFilter[]>([]);
  const pendingExpandRef = useRef<string | null>(null);

  // A new result resets the whole view.
  useEffect(() => {
    setElements([...initial.elements.nodes, ...initial.elements.edges]);
    setLegend(initial.legend);
    setFilters([]);
    setSelectedLabel(null);
    setHoverInfo(null);
  }, [initial]);

  const nodeCount = useMemo(() => elements.filter((e) => e.group === 'nodes').length, [elements]);
  const edgeCount = useMemo(() => elements.filter((e) => e.group === 'edges').length, [elements]);

  /** Remove an element (and, for nodes, its connected edges) from state. */
  const removeFromState = useCallback((ele: cytoscape.SingularElementArgument) => {
    const id = ele.id();
    const cascade = new Set<string>([id]);
    if (ele.isNode()) {
      ele.connectedEdges().forEach((edge) => {
        cascade.add(edge.id());
      });
    }
    setElements((prev) => prev.filter((el) => !cascade.has(String(el.data.id))));
  }, []);

  // ---- context-menu actions -------------------------------------------

  const expandElement = useCallback(
    async (ele: cytoscape.SingularElementArgument) => {
      if (!cy) return;
      if (!graph) {
        message.warning('No active graph — connect to a database first.');
        return;
      }
      const centerId = ele.id();
      try {
        const data = await getNeighbors({ graph, vertexId: centerId }).unwrap();
        const generated = generateCytoscapeElement(data.rows, { isNew: true, registry });
        const fresh = [...generated.elements.nodes, ...generated.elements.edges].filter(
          (el) => cy.getElementById(String(el.data.id)).empty(),
        );
        if (fresh.length === 0) {
          message.info('No data to extend.');
          return;
        }
        pendingExpandRef.current = centerId;
        setElements((prev) => [...prev, ...fresh]);
        setLegend((prev) => mergeLegends(prev, generated.legend));
      } catch (err) {
        message.error(formatApiError(err as ApiError));
      }
    },
    [cy, graph, getNeighbors, message, registry],
  );

  const requestDelete = useCallback(
    (ele: cytoscape.SingularElementArgument) => {
      if (!graph) {
        message.warning('No active graph — connect to a database first.');
        return;
      }
      const isNode = ele.isNode();
      const kind = isNode ? 'v' : 'e';
      const id = ele.id();
      modal.confirm({
        title: 'Delete Confirmation',
        content: isNode
          ? 'After clicking on confirm, the node and related edge will be deleted from the database.'
          : 'After clicking on confirm, the edge will be deleted from the database.',
        okText: 'Confirm',
        cancelText: 'Cancel',
        onOk: async () => {
          try {
            await deleteElement({ graph, id, kind }).unwrap();
            removeFromState(ele);
            message.success(
              isNode
                ? 'The node has been deleted from your database. Please re-run the query.'
                : 'The edge has been deleted from your database. Please re-run the query.',
            );
            // Keep cached metadata counts honest (old app refreshed meta).
            const meta = await getMetaData({ currentGraph: graph }).unwrap();
            dispatch(setMetaData(processMetadataResponse(meta)));
          } catch (err) {
            message.error(formatApiError(err as ApiError));
          }
        },
      });
    },
    [graph, modal, deleteElement, removeFromState, message, getMetaData, dispatch],
  );

  const addFilterForElement = useCallback(
    (ele: cytoscape.SingularElementArgument) => {
      const data = ele.data() as GraphElementData;
      const keyword = data.properties?.[data.caption];
      if (keyword === undefined || keyword === null || keyword === '') {
        message.info('Nothing to filter on for this element.');
        return;
      }
      setFilters((prev) => [
        ...prev,
        { key: uid(), label: data.label, property: data.caption, keyword: String(keyword) },
      ]);
    },
    [message],
  );

  const removeFilterForElement = useCallback((ele: cytoscape.SingularElementArgument) => {
    const data = ele.data() as GraphElementData;
    const keyword = String(data.properties?.[data.caption] ?? '');
    setFilters((prev) => prev.filter((f) => f.keyword !== keyword));
  }, []);

  // Indirection so the once-created cxtmenus always call fresh handlers.
  const handlersRef = useRef({
    expand: expandElement,
    removeFromState,
    requestDelete,
    addFilterForElement,
    removeFilterForElement,
  });
  useEffect(() => {
    handlersRef.current = {
      expand: expandElement,
      removeFromState,
      requestDelete,
      addFilterForElement,
      removeFilterForElement,
    };
  });

  // ---- cytoscape event binding ----------------------------------------

  useEffect(() => {
    if (!cy) return undefined;

    const onMouseover = (e: cytoscape.EventObject) => {
      const target = e.target as cytoscape.SingularElementArgument;
      target.addClass('highlight');
      setHoverInfo({ ...(target.data() as GraphElementData) });
    };
    const onMouseout = (e: cytoscape.EventObject) => {
      const target = e.target as cytoscape.SingularElementArgument;
      target.removeClass('highlight');
      const selected = cy.elements(':selected');
      setHoverInfo(
        selected.nonempty() ? { ...(selected[0].data() as GraphElementData) } : null,
      );
    };
    const onTap = (e: cytoscape.EventObject) => {
      if (e.target === cy) {
        // Background tap: clear selection (old chart behavior).
        cy.elements(':selected').unselect().selectify();
        setHoverInfo(null);
        setSelectedLabel(null);
        return;
      }
      const ele = e.target as cytoscape.SingularElementArgument;
      // Selection neighborhood highlight (old chart click handler).
      if (ele.selected() && ele.isNode()) {
        if (cy.nodes(':selected').size() === 1) {
          ele.neighborhood().selectify().select().unselectify();
        } else {
          cy.nodes(':selected')
            .filter(`[id != "${ele.id()}"]`)
            .neighborhood()
            .selectify()
            .select()
            .unselectify();
        }
      } else if (ele.selected()) {
        cy.elements(':selected').unselect().selectify();
      }
      setHoverInfo({ ...(ele.data() as GraphElementData) });
    };

    cy.on('mouseover', 'node, edge', onMouseover);
    cy.on('mouseout', 'node, edge', onMouseout);
    cy.on('tap', onTap);
    return () => {
      cy.off('mouseover', 'node, edge', onMouseover);
      cy.off('mouseout', 'node, edge', onMouseout);
      cy.off('tap', onTap);
    };
  }, [cy]);

  // ---- context menus (created once per cytoscape instance) ------------

  useEffect(() => {
    if (!cy) return undefined;
    const icon = (node: React.ReactElement) => renderToStaticMarkup(node);
    const common = {
      menuRadius: (ele: cytoscape.SingularElementArgument) => (ele.cy().zoom() <= 1 ? 55 : 70),
      fillColor: 'rgba(210, 213, 218, 1)',
      activeFillColor: 'rgba(166, 166, 166, 1)',
      activePadding: 0,
      indicatorSize: 0,
      separatorWidth: 4,
      spotlightPadding: 3,
      minSpotlightRadius: 11,
      maxSpotlightRadius: 99,
      openMenuEvents: 'cxttap',
      itemColor: '#2A2C34',
      itemTextShadowColor: 'transparent',
      zIndex: 9999,
      atMouse: false,
    };
    const nodeMenu = cy.cxtmenu({
      ...common,
      selector: 'node',
      commands: [
        {
          content: icon(<UndoOutlined />),
          select: (ele) => {
            const pos = initialPositions[ele.id()];
            if (pos) ele.animate({ position: pos });
          },
        },
        {
          content: icon(<DeploymentUnitOutlined />),
          select: (ele) => {
            void handlersRef.current.expand(ele);
          },
        },
        {
          content: icon(<EyeInvisibleOutlined />),
          select: (ele) => handlersRef.current.removeFromState(ele),
        },
        {
          content: icon(<DeleteOutlined />),
          select: (ele) => handlersRef.current.requestDelete(ele),
        },
        {
          content: icon(<LockOutlined />),
          select: (ele) => toggleLock(ele),
        },
        {
          content: icon(<FilterOutlined />),
          select: (ele) => handlersRef.current.addFilterForElement(ele),
        },
        {
          content: icon(<CloseCircleOutlined />),
          select: (ele) => handlersRef.current.removeFilterForElement(ele),
        },
      ],
    });
    const edgeMenu = cy.cxtmenu({
      ...common,
      selector: 'edge',
      commands: [
        {
          content: icon(<EyeInvisibleOutlined />),
          select: (ele) => handlersRef.current.removeFromState(ele),
        },
        {
          content: icon(<DeleteOutlined />),
          select: (ele) => handlersRef.current.requestDelete(ele),
        },
        {
          content: icon(<LockOutlined />),
          select: (ele) => toggleLock(ele),
        },
      ],
    });
    return () => {
      nodeMenu.destroy();
      edgeMenu.destroy();
    };
  }, [cy]);

  // ---- neighbor-expansion re-positioning (old chart addElements) ------

  useEffect(() => {
    if (!cy || pendingExpandRef.current === null) return;
    const centerId = pendingExpandRef.current;
    pendingExpandRef.current = null;
    const fresh = cy.elements('.new');
    if (fresh.empty()) return;
    const newEdges = cy.edges('.new');
    const center = cy.getElementById(centerId);
    const centerPos = center.nonempty() ? { ...center.position() } : { x: 0, y: 0 };
    cy.elements().lock();
    const rerender = newEdges.union(newEdges.targets()).union(newEdges.sources());
    rerender
      .layout({
        name: 'concentric',
        fit: false,
        height: 100,
        width: 100,
      } as unknown as cytoscape.LayoutOptions)
      .run();
    if (center.nonempty()) {
      // Shift the laid-out ring so the expanded node stays where it was.
      const moved = { ...center.position() };
      const dx = moved.x - centerPos.x;
      const dy = moved.y - centerPos.y;
      rerender.forEach((ele) => {
        if (ele.isNode()) {
          const pos = ele.position();
          ele.position({ x: pos.x - dx, y: pos.y - dy });
        }
      });
    }
    cy.elements().unlock();
    fresh.removeClass('new');
    // Strip the transient 'new' class from state too (the cy copy was
    // cleaned above; keeps the next syncElements from re-adding it).
    setElements((prev) =>
      prev.map((el) =>
        el.classes.includes('new')
          ? { ...el, classes: el.group === 'nodes' ? 'node' : 'edge' }
          : el,
      ),
    );
  }, [cy, elements]);

  // ---- filters ---------------------------------------------------------

  useEffect(() => {
    if (cy) applyGraphFilters(cy, filters);
  }, [cy, filters, elements]);

  // ---- label style editing ---------------------------------------------

  const updateLabelStyle = useCallback(
    (type: 'node' | 'edge', label: string, patch: Partial<GraphElementData>) => {
      setElements((prev) =>
        prev.map((el) =>
          el.data.label === label &&
          (type === 'node' ? el.group === 'nodes' : el.group === 'edges')
            ? { ...el, data: { ...el.data, ...patch } }
            : el,
        ),
      );
      setLegend((prev) => {
        const key = type === 'node' ? 'nodeLegend' : 'edgeLegend';
        const entry = prev[key][label];
        if (!entry) return prev;
        const legendPatch: Partial<LegendEntry> = {};
        if (patch.backgroundColor !== undefined) legendPatch.color = patch.backgroundColor;
        if (patch.borderColor !== undefined) legendPatch.borderColor = patch.borderColor;
        if (patch.fontColor !== undefined) legendPatch.fontColor = patch.fontColor;
        if (patch.size !== undefined) legendPatch.size = patch.size;
        if (patch.caption !== undefined) legendPatch.caption = patch.caption;
        return { ...prev, [key]: { ...prev[key], [label]: { ...entry, ...legendPatch } } };
      });
    },
    [],
  );

  const handleColor = useCallback(
    (type: 'node' | 'edge', label: string, color: LabelColor) => {
      if (type === 'node') registry.setNodeColor(label, color);
      else registry.setEdgeColor(label, color);
      updateLabelStyle(type, label, {
        backgroundColor: color.color,
        borderColor: color.borderColor,
        fontColor: color.fontColor,
      });
    },
    [registry, updateLabelStyle],
  );

  const handleSize = useCallback(
    (type: 'node' | 'edge', label: string, size: number) => {
      if (type === 'node') registry.setNodeSize(label, size);
      else registry.setEdgeSize(label, size);
      updateLabelStyle(type, label, { size });
    },
    [registry, updateLabelStyle],
  );

  const handleCaption = useCallback(
    (type: 'node' | 'edge', label: string, caption: string) => {
      if (type === 'node') registry.setNodeCaption(label, caption);
      else registry.setEdgeCaption(label, caption);
      updateLabelStyle(type, label, { caption });
    },
    [registry, updateLabelStyle],
  );

  // ---- footer actions ---------------------------------------------------

  const refreshLayout = useCallback(() => {
    if (cy) runLayout(cy, layoutName);
  }, [cy, layoutName]);

  const downloadPng = useCallback(() => {
    if (!cy || cy.elements().empty()) {
      message.warning('No data to download!');
      return;
    }
    const blob = cy.png({ output: 'blob', full: true, bg: 'transparent' });
    saveAs(blob, `${exportName}.png`);
  }, [cy, exportName, message]);

  // ---- render ------------------------------------------------------------

  const selectedEntry = selectedLabel
    ? selectedLabel.type === 'node'
      ? legend.nodeLegend[selectedLabel.label]
      : legend.edgeLegend[selectedLabel.label]
    : undefined;

  const legendBadge = (type: 'node' | 'edge', label: string, entry: LegendEntry) => (
    <Tag
      key={`${type}:${label}`}
      className={styles.legendTag}
      style={{
        backgroundColor: entry.color,
        color: entry.fontColor,
        borderColor: entry.borderColor,
        outline:
          selectedLabel?.type === type && selectedLabel.label === label
            ? '2px solid #2756FF'
            : undefined,
      }}
      onClick={() =>
        setSelectedLabel((prev) =>
          prev && prev.type === type && prev.label === label ? null : { type, label },
        )
      }
    >
      {label}
    </Tag>
  );

  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      <div className={styles.legend}>
        <div className={styles.legendRow}>
          <span className={styles.legendTitle}>Node:</span>
          {Object.entries(legend.nodeLegend).map(([label, entry]) =>
            legendBadge('node', label, entry),
          )}
        </div>
        <div className={styles.legendRow}>
          <span className={styles.legendTitle}>Edge:</span>
          {Object.entries(legend.edgeLegend).map(([label, entry]) =>
            legendBadge('edge', label, entry),
          )}
        </div>
      </div>

      <div className={styles.canvas}>
        <CytoscapeCanvas
          elements={elements}
          layoutName={layoutName}
          onCy={setCy}
        />
      </div>

      {filters.length > 0 && (
        <div className={styles.filterBar}>
          <FilterOutlined style={{ color: '#888' }} />
          {filters.map((f) => (
            <Tag
              key={f.key}
              closable
              onClose={() => setFilters((prev) => prev.filter((x) => x.key !== f.key))}
            >
              {`[${f.label}] ${f.property} ~ "${f.keyword}"`}
            </Tag>
          ))}
          <Button size="small" type="link" onClick={() => setFilters([])}>
            clear all
          </Button>
        </div>
      )}

      <div className={styles.footer}>
        <div className={styles.footerInfo}>
          {selectedLabel && selectedEntry ? (
            <LabelEditor
              type={selectedLabel.type}
              label={selectedLabel.label}
              entry={selectedEntry}
              captionOptions={[
                'gid',
                'label',
                ...propertyKeysOf(elements, selectedLabel.label),
              ]}
              onColor={(c) => handleColor(selectedLabel.type, selectedLabel.label, c)}
              onSize={(s) => handleSize(selectedLabel.type, selectedLabel.label, s)}
              onCaption={(c) => handleCaption(selectedLabel.type, selectedLabel.label, c)}
            />
          ) : hoverInfo ? (
            <ElementDetails data={hoverInfo} />
          ) : (
            <span>
              Displaying <strong>{nodeCount}</strong> nodes, <strong>{edgeCount}</strong>{' '}
              edges
            </span>
          )}
        </div>
        <Space size={4} wrap>
          <span className={styles.footerLabel}>Layout :</span>
          <Select
            size="small"
            style={{ width: 130 }}
            value={layoutName}
            onChange={setLayoutName}
            options={(Object.keys(layoutDisplayNames) as LayoutName[]).map((name) => ({
              value: name,
              label: layoutDisplayNames[name],
            }))}
          />
          <Tooltip title="Re-run layout">
            <Button size="small" icon={<ReloadOutlined />} onClick={refreshLayout} aria-label="refresh layout" />
          </Tooltip>
          <Tooltip title="Download PNG">
            <Button size="small" icon={<CameraOutlined />} onClick={downloadPng} aria-label="download png" />
          </Tooltip>
          <Popover
            trigger="click"
            placement="topRight"
            content={
              <FilterForm
                legend={legend}
                elements={elements}
                onAdd={(f) => setFilters((prev) => [...prev, f])}
              />
            }
          >
            <Button size="small" icon={<FilterOutlined />} aria-label="add filter">
              {filters.length > 0 ? `(${filters.length})` : ''}
            </Button>
          </Popover>
        </Space>
      </div>
    </div>
  );
}

export default function GraphResultView(props: GraphResultViewProps) {
  // Local antd App wrapper so message/modal get theme context without
  // touching the shared App.tsx.
  return (
    <AntdApp>
      <GraphResultViewInner {...props} />
    </AntdApp>
  );
}
