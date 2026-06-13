import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import { Alignment } from '@ckeditor/ckeditor5-alignment';
import { Font, FontFamily, FontSize, FontColor, FontBackgroundColor } from '@ckeditor/ckeditor5-font';
import { FindAndReplace } from '@ckeditor/ckeditor5-find-and-replace';
import { SourceEditing } from '@ckeditor/ckeditor5-source-editing';
import { Highlight } from '@ckeditor/ckeditor5-highlight';
import { HorizontalLine } from '@ckeditor/ckeditor5-horizontal-line';
import { SpecialCharacters, SpecialCharactersEssentials } from '@ckeditor/ckeditor5-special-characters';
import { WordCount } from '@ckeditor/ckeditor5-word-count';

ClassicEditor.builtinPlugins = [
  ...ClassicEditor.builtinPlugins,
  Alignment,
  Font,
  FontFamily,
  FontSize,
  FontColor,
  FontBackgroundColor,
  FindAndReplace,
  SourceEditing,
  Highlight,
  HorizontalLine,
  SpecialCharacters,
  SpecialCharactersEssentials,
  WordCount,
];

export default ClassicEditor;
