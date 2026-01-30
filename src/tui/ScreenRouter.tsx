import React from 'react';
import { useNavigation } from './context/navigation.js';
import type { Screen } from './types.js';
import { BrandHeader } from './ui/BrandHeader.js';
import { FlashBar } from './ui/FlashBar.js';

import { AddConfirmScreen } from './screens/AddConfirm.js';
import { AddInstallScreen } from './screens/AddInstall.js';
import { AddModeScreen } from './screens/AddMode.js';
import { AddResultScreen } from './screens/AddResult.js';
import { AddScopeScreen } from './screens/AddScope.js';
import { AddSkillSelectScreen } from './screens/AddSkillSelect.js';
import { AddSourceScreen } from './screens/AddSource.js';
import { AddTargetsScreen } from './screens/AddTargets.js';
import { FindSkillResultsScreen } from './screens/FindSkillResults.js';
import { FindSkillSearchScreen } from './screens/FindSkillSearch.js';
import { GetUrlScreen } from './screens/GetUrl.js';
import { ListScreen } from './screens/ListSkills.js';
import { MainMenu } from './screens/MainMenu.js';
import { ManageScreen } from './screens/ManageSkills.js';
import { MarketplacePluginScreen } from './screens/MarketplacePlugins.js';
import { MarketplaceSkillScreen } from './screens/MarketplaceSkills.js';
import { UpdateScreen } from './screens/UpdateSkills.js';

export function ScreenRouter() {
  const { screen } = useNavigation();

  const render = (s: Screen) => {
    switch (s) {
      case 'main':
        return <MainMenu />;
      case 'add-source':
        return <AddSourceScreen />;
      case 'add-marketplace-plugins':
        return <MarketplacePluginScreen />;
      case 'add-marketplace-skills':
        return <MarketplaceSkillScreen />;
      case 'find-skill-search':
        return <FindSkillSearchScreen />;
      case 'find-skill-results':
        return <FindSkillResultsScreen />;
      case 'get-url':
        return <GetUrlScreen />;
      case 'add-skill-select':
        return <AddSkillSelectScreen />;
      case 'add-targets':
        return <AddTargetsScreen />;
      case 'add-scope':
        return <AddScopeScreen />;
      case 'add-mode':
        return <AddModeScreen />;
      case 'add-confirm':
        return <AddConfirmScreen />;
      case 'add-install':
        return <AddInstallScreen />;
      case 'add-result':
        return <AddResultScreen />;
      case 'list':
        return <ListScreen />;
      case 'manage':
        return <ManageScreen />;
      case 'update':
        return <UpdateScreen />;
      default:
        return null;
    }
  };
  return (
    <>
      <BrandHeader />
      {render(screen)}
      <FlashBar align="center" />
    </>
  );
}
