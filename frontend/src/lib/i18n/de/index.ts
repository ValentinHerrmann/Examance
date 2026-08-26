// German catalog — the source of truth. Adding a key here makes every other
// catalog fail to type-check until it is translated too.
import { common } from './common';
import { nav } from './nav';
import { statusBar } from './statusBar';
import { storagePolicy } from './storagePolicy';
import { settings } from './settings';
import { errors } from './errors';
import { auth } from './auth';
import { workspace } from './workspace';
import { dashboard } from './dashboard';
import { exam } from './exam';
import { examCreation } from './examCreation';
import { exercises } from './exercises';
import { grading } from './grading';
import { scanning } from './scanning';
import { stats } from './stats';
import { admin } from './admin';
import { legal } from './legal';
import { editor } from './editor';
import { misc } from './misc';
import { help } from './help';

export const de = {
    common,
    nav,
    statusBar,
    storagePolicy,
    settings,
    errors,
    auth,
    workspace,
    dashboard,
    exam,
    examCreation,
    exercises,
    grading,
    scanning,
    stats,
    admin,
    legal,
    editor,
    misc,
    help,
} as const;
