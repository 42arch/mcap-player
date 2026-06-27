import {
  DatabaseIcon,
  GearIcon,
  TagIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import InspectorPanel from '@/components/panels/InspectorPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ProblemsTab from '../overview/ProblemsTab'
import SettingsTab from '../overview/SettingsTab'
import TopicsTab from '../overview/TopicsTab'

type ActiveTab = 'topic' | 'metadata' | 'problems' | 'settings'

export default function OverviewArea() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('topic')

  const tabs: Array<{ id: ActiveTab, label: string, icon: typeof TagIcon }> = [
    { id: 'topic', label: 'Topics', icon: TagIcon },
    { id: 'metadata', label: 'Metadata', icon: DatabaseIcon },
    { id: 'problems', label: 'Problems', icon: WarningCircleIcon },
    { id: 'settings', label: 'Settings', icon: GearIcon },
  ]

  return (
    <div className="w-full h-full flex flex-col bg-panel border-r border-layout-border">
      {/* Tabs Container */}
      <Tabs
        value={activeTab}
        onValueChange={val => setActiveTab(val as ActiveTab)}
        className="flex-1 flex flex-col min-h-0"
      >
        {/* Tabs Row */}
        <TabsList
          variant="line"
          className="w-full justify-start border-b border-layout-border bg-titlebar px-2 shrink-0 h-[34px] gap-0 rounded-none overflow-x-auto scrollbar-none"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={`flex items-center gap-1 px-2 h-full text-[10.5px] font-sans font-medium transition-all cursor-pointer relative rounded-none border-b-2 border-transparent ${
                  isActive
                    ? 'text-layout-primary after:bg-layout-primary after:opacity-100 font-semibold'
                    : 'text-text-secondary hover:text-text-main hover:bg-layout-hover/20'
                }`}
              >
                {/* <Icon size={12} className={isActive ? 'text-layout-primary' : 'text-text-secondary'} /> */}
                <span>{tab.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* Tab Contents Area */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-panel/30">
          <TabsContent value="topic" className="p-0 m-0">
            <TopicsTab />
          </TabsContent>

          <TabsContent value="metadata" className="p-0 m-0 h-full">
            <InspectorPanel />
          </TabsContent>

          <TabsContent value="problems" className="p-0 m-0">
            <ProblemsTab />
          </TabsContent>

          <TabsContent value="settings" className="p-0 m-0">
            <SettingsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
