// Libraries
import React, { PureComponent } from 'react';
import ReactGridLayout, { ItemCallback } from 'react-grid-layout';
import classNames from 'classnames';
import AutoSizer from 'react-virtualized-auto-sizer';

// Components
import { AddPanelWidget } from '../components/AddPanelWidget';
import { DashboardRow } from '../components/DashboardRow';

// Types
import { GRID_CELL_HEIGHT, GRID_CELL_VMARGIN, GRID_COLUMN_COUNT } from 'app/core/constants';
import { DashboardPanel } from './DashboardPanel';
import { DashboardModel, PanelModel } from '../state';
import { Subscription } from 'rxjs';
import { DashboardPanelsChangedEvent } from 'app/types/events';

export interface Props {
  dashboard: DashboardModel;
  editPanel: PanelModel | null;
  viewPanel: PanelModel | null;
  scrollTop: number;
  isPanelEditorOpen?: boolean;
}

export interface State {
  isLayoutInitialized: boolean;
}

export class DashboardGrid extends PureComponent<Props, State> {
  private panelMap: { [id: string]: PanelModel } = {};
  private eventSubs = new Subscription();
  private windowHeight = 1200;
  private width = 0;

  constructor(props: Props) {
    super(props);

    this.state = {
      isLayoutInitialized: false,
    };
  }

  componentDidMount() {
    const { dashboard } = this.props;
    this.eventSubs.add(dashboard.events.subscribe(DashboardPanelsChangedEvent, this.triggerForceUpdate));
  }

  componentWillUnmount() {
    this.eventSubs.unsubscribe();
  }

  buildLayout() {
    const layout = [];
    this.panelMap = {};

    for (const panel of this.props.dashboard.panels) {
      const stringId = panel.id.toString();
      this.panelMap[stringId] = panel;

      if (!panel.gridPos) {
        console.log('panel without gridpos');
        continue;
      }

      const panelPos: any = {
        i: stringId,
        x: panel.gridPos.x,
        y: panel.gridPos.y,
        w: panel.gridPos.w,
        h: panel.gridPos.h,
      };

      if (panel.type === 'row') {
        panelPos.w = GRID_COLUMN_COUNT;
        panelPos.h = 1;
        panelPos.isResizable = false;
        panelPos.isDraggable = panel.collapsed;
      }

      layout.push(panelPos);
    }

    return layout;
  }

  onLayoutChange = (newLayout: ReactGridLayout.Layout[]) => {
    for (const newPos of newLayout) {
      this.panelMap[newPos.i!].updateGridPos(newPos);
    }

    this.props.dashboard.sortPanelsByGridPos();

    // This is called on grid mount as it can correct invalid initial grid positions
    if (!this.state.isLayoutInitialized) {
      this.setState({ isLayoutInitialized: true });
    }
  };

  triggerForceUpdate = () => {
    this.forceUpdate();
  };

  updateGridPos = (item: ReactGridLayout.Layout, layout: ReactGridLayout.Layout[]) => {
    this.panelMap[item.i!].updateGridPos(item);
  };

  onResize: ItemCallback = (layout, oldItem, newItem) => {
    this.panelMap[newItem.i!].updateGridPos(newItem);
  };

  onResizeStop: ItemCallback = (layout, oldItem, newItem) => {
    this.updateGridPos(newItem, layout);
  };

  onDragStop: ItemCallback = (layout, oldItem, newItem) => {
    this.updateGridPos(newItem, layout);
  };

  isInView(panel: PanelModel) {
    if (panel.isViewing || panel.isEditing) {
      return true;
    }

    const scrollTop = this.props.scrollTop;
    const panelTop = panel.gridPos.y * (GRID_CELL_HEIGHT + GRID_CELL_VMARGIN);
    const panelBottom = panelTop + panel.gridPos.h * (GRID_CELL_HEIGHT + GRID_CELL_VMARGIN) - GRID_CELL_VMARGIN;

    // Show things that are almost in the view
    const buffer = 100;

    // The panel is above the viewport
    if (scrollTop > panelBottom + buffer) {
      return false;
    }

    const scrollViewBottom = scrollTop + this.windowHeight;

    // Panel is below view
    if (panelTop > scrollViewBottom + buffer) {
      return false;
    }

    return !this.props.dashboard.otherPanelInFullscreen(panel);
  }

  renderPanels(width: number) {
    const panelElements = [];

    // This is to avoid layout re-flows, accessing window.innerHeight can trigger re-flow
    // We assume here that if width change height might have changed as well
    if (this.width !== width) {
      this.windowHeight = window.innerHeight ?? 1000;
    }

    for (const panel of this.props.dashboard.panels) {
      const panelClasses = classNames({ 'react-grid-item--fullscreen': panel.isViewing });
      const id = panel.id.toString();
      panel.isInView = this.isInView(panel);

      panelElements.push(
        <div key={id} className={panelClasses} data-panelid={id}>
          {this.renderPanel(panel)}
        </div>
      );
    }

    return panelElements;
  }

  renderPanel(panel: PanelModel) {
    if (panel.type === 'row') {
      return <DashboardRow panel={panel} dashboard={this.props.dashboard} />;
    }

    if (panel.type === 'add-panel') {
      return <AddPanelWidget panel={panel} dashboard={this.props.dashboard} />;
    }

    return (
      <DashboardPanel
        panel={panel}
        dashboard={this.props.dashboard}
        isEditing={panel.isEditing}
        isViewing={panel.isViewing}
        isInView={panel.isInView}
      />
    );
  }

  render() {
    const { dashboard, viewPanel } = this.props;

    const autoSizerStyle = !!viewPanel ? { width: '100%', height: '100%' } : undefined;

    return (
      <AutoSizer style={autoSizerStyle} disableHeight>
        {({ width }) => {
          if (width === 0) {
            return null;
          }

          const draggable = width <= 769 ? false : dashboard.meta.canEdit;

          /*
            Disable draggable if mobile device, solving an issue with unintentionally
            moving panels. https://github.com/grafana/grafana/issues/18497
            theme.breakpoints.md = 769      
          */

          return (
            <ReactGridLayout
              width={width}
              isDraggable={draggable}
              isResizable={dashboard.meta.canEdit}
              containerPadding={[0, 0]}
              useCSSTransforms={false}
              margin={[GRID_CELL_VMARGIN, GRID_CELL_VMARGIN]}
              cols={GRID_COLUMN_COUNT}
              rowHeight={GRID_CELL_HEIGHT}
              draggableHandle=".grid-drag-handle"
              layout={this.buildLayout()}
              onDragStop={this.onDragStop}
              onResize={this.onResize}
              onResizeStop={this.onResizeStop}
              onLayoutChange={this.onLayoutChange}
            >
              {this.renderPanels(width)}
            </ReactGridLayout>
          );
        }}
      </AutoSizer>
    );
  }
}
